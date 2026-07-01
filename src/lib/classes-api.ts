import { getSignedAssetUrlFn } from "@/lib/asset.functions";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { authenticatedFetch, authHeaderRecord, ensureAuthToken, readApiError } from "@/lib/authenticated-client";
import { apiCreateClassRecords, apiFinalizeClass } from "@/lib/classes-client";
import type { FinalizeClassInput, FinalizeClassResult } from "@/lib/class-finalize.functions";
import {
  addSectionFn,
  addSectionVideoLinkFn,
  deleteSectionAssetFn,
  deleteSectionFn,
  deleteClassFn,
  deleteCourseFn,
  getClassAssessmentSeedFn,
  getClassFn,
  getCourseFn,
  getSectionAssetFn,
  getSectionAssetsForSectionFn,
  listClassesForCountsFn,
  listClassesForCourseFn,
  listCoursesFn,
  listSectionQuestionsFn,
  listSectionsWithAssetsFn,
  updateClassMetaFn,
  updateClassStatusFn,
  updateSectionFn,
} from "@/lib/classes.functions";
import type { ClassStatus, Level } from "@/lib/class-create.validation";
import type { Question } from "@/lib/test-types";

export interface CreateClassResult {
  classId: string;
  courseId: string;
}

export type { ClassStatus, Level } from "@/lib/class-create.validation";

export interface CourseRow {
  id: string;
  title: string;
  description: string;
  role: string;
  level: string;
  cover: string;
  topics: string[];
  status: string;
  is_core_onboarding: boolean;
  updated_at: string;
}

export interface ClassRow {
  id: string;
  course_id: string | null;
  name: string;
  summary: string;
  level: string;
  audience: string;
  topics: string[];
  status: string;
  test_difficulty: string;
  test_mcq_count: number;
  test_subjective_count: number;
  test_pass_mark: number;
  test_retest: boolean;
  updated_at: string;
}

export interface SectionInput {
  title: string;
  description: string;
  durationMin: number;
  objectives: string;
  position: number;
  videoFile?: File | null;
  videoLink?: string;
  documents: File[];
  transcripts: File[];
}

export interface ClassInput {
  name: string;
  parentCourse: string;
  level: Level;
  audience: string;
  summary: string;
  topics: string[];
  sections: SectionInput[];
  test: {
    difficulty: Level;
    mcqCount: number;
    subjectiveCount: number;
    passMark: number;
    retest: boolean;
  };
  status: ClassStatus;
}

export interface SectionRow {
  id: string;
  class_id: string;
  title: string;
  description: string;
  duration_min: number;
  objectives: string;
  position: number;
  questions_status?: string;
  questions_updated_at?: string | null;
}

export interface SectionAssetRow {
  id: string;
  section_id: string;
  kind: string;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
}

async function deleteAssetRemote(bucket: AssetBucket, storagePath: string): Promise<void> {
  const res = await authenticatedFetch("/api/internal/assets/delete", {
    method: "POST",
    body: JSON.stringify({ bucket, path: storagePath }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
}

async function uploadAsset(
  bucket: AssetBucket,
  classId: string,
  sectionId: string,
  file: File,
): Promise<{ path: string }> {
  const safe = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storagePath = `${classId}/${sectionId}/${Date.now()}-${safe}`;

  const form = new FormData();
  form.append("file", file);
  form.append("bucket", bucket);
  form.append("path", storagePath);

  const token = await ensureAuthToken();
  const res = await fetch("/api/internal/assets/upload", {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    let message = "Upload failed";
    try {
      const json = JSON.parse(err) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      if (err && !err.trimStart().startsWith("<!")) message = err.slice(0, 200);
      else if (res.status === 401) message = "Not authenticated — sign in again";
      else message = `Upload failed (HTTP ${res.status})`;
    }
    throw new Error(message);
  }
  return { path: storagePath };
}

async function insertSectionAssetRecord(
  sectionId: string,
  kind: string,
  bucket: AssetBucket,
  path: string,
  file: File,
): Promise<string> {
  const res = await authenticatedFetch("/api/classes/section-asset", {
    method: "POST",
    body: JSON.stringify({
      sectionId,
      kind,
      storageBucket: bucket,
      storagePath: path,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function finalizeClass(input: FinalizeClassInput): Promise<FinalizeClassResult> {
  return apiFinalizeClass(input);
}

export async function createClass(input: ClassInput): Promise<CreateClassResult> {
  const { classId, courseId, sections: createdSections } = await apiCreateClassRecords({
      name: input.name,
      parentCourse: input.parentCourse,
      level: input.level,
      audience: input.audience,
      summary: input.summary,
      topics: input.topics,
      status: input.status,
      test: input.test,
      sections: input.sections.map((sec) => ({
        title: sec.title,
        description: sec.description,
        durationMin: sec.durationMin,
        objectives: sec.objectives,
        position: sec.position,
        videoLink: sec.videoLink?.trim() || undefined,
      })),
    },
  );

  const sectionIdByPosition = new Map(createdSections.map((s) => [s.position, s.id]));

  for (const sec of input.sections) {
    const sectionId = sectionIdByPosition.get(sec.position);
    if (!sectionId) {
      throw new Error(`Section at position ${sec.position} was not created`);
    }

    if (sec.videoFile) {
      const { path } = await uploadAsset("class-videos", classId, sectionId, sec.videoFile);
      await insertSectionAssetRecord(sectionId, "video", "class-videos", path, sec.videoFile);
    }

    for (const doc of sec.documents) {
      const { path } = await uploadAsset("class-documents", classId, sectionId, doc);
      await insertSectionAssetRecord(sectionId, "document", "class-documents", path, doc);
    }

    for (const tr of sec.transcripts) {
      const { path } = await uploadAsset("class-transcripts", classId, sectionId, tr);
      await insertSectionAssetRecord(sectionId, "transcript", "class-transcripts", path, tr);
    }
  }

  return { classId, courseId };
}

export interface CourseWithStats extends CourseRow {
  enrolled: number;
  completion: number;
  classCount: number;
  derivedStatus: ClassStatus;
}

export async function listCourses(): Promise<CourseWithStats[]> {
  return listCoursesFn();
}

export async function listClassesForCounts(): Promise<ClassRow[]> {
  return listClassesForCountsFn();
}

export async function getCourse(courseId: string): Promise<CourseRow | null> {
  return getCourseFn({ data: { courseId } });
}

export async function listClassesForCourse(courseId: string): Promise<ClassRow[]> {
  return listClassesForCourseFn({ data: { courseId } });
}

export async function getClass(classId: string): Promise<ClassRow | null> {
  return getClassFn({ data: { classId } });
}

export async function listSectionsWithAssets(
  classId: string,
): Promise<Array<SectionRow & { assets: SectionAssetRow[] }>> {
  return listSectionsWithAssetsFn({ data: { classId } });
}

export interface ClassAssessmentSeed {
  materialText: string;
  fileNames: string[];
  questions: Question[];
  sectionCount: number;
  assetCount: number;
}

export async function getClassAssessmentSeed(classId: string): Promise<ClassAssessmentSeed> {
  return getClassAssessmentSeedFn({ data: { classId } });
}

export async function updateClassStatus(classId: string, status: ClassStatus): Promise<void> {
  await updateClassStatusFn({ data: { classId, status } });
}

export async function updateClassMeta(
  classId: string,
  patch: Partial<Pick<ClassRow, "name" | "summary" | "audience" | "level" | "topics">>,
): Promise<void> {
  await updateClassMetaFn({ data: { classId, patch } });
}

export async function updateSection(
  sectionId: string,
  patch: Partial<Pick<SectionRow, "title" | "description" | "duration_min" | "objectives" | "position">>,
): Promise<void> {
  await updateSectionFn({ data: { sectionId, patch } });
}

export async function addSection(
  classId: string,
  data: { title: string; description?: string; duration_min?: number; objectives?: string },
): Promise<SectionRow> {
  return addSectionFn({ data: { classId, ...data } });
}

export async function deleteSection(sectionId: string): Promise<void> {
  const assets = await getSectionAssetsForSectionFn({ data: { sectionId } });
  for (const a of assets) {
    if (a.storage_bucket && a.storage_path) {
      await deleteAssetRemote(a.storage_bucket as AssetBucket, a.storage_path);
    }
  }
  await deleteSectionFn({ data: { sectionId } });
}

export async function deleteClass(classId: string): Promise<void> {
  await deleteClassFn({ data: { classId } });
}

export async function deleteCourse(courseId: string): Promise<{ deletedClasses: number }> {
  return deleteCourseFn({ data: { courseId } });
}

export async function uploadSectionAsset(
  classId: string,
  sectionId: string,
  kind: "video" | "document" | "transcript",
  file: File,
): Promise<string> {
  const bucket =
    kind === "video" ? "class-videos" : kind === "document" ? "class-documents" : "class-transcripts";
  const { path } = await uploadAsset(bucket, classId, sectionId, file);
  return insertSectionAssetRecord(sectionId, kind, bucket, path, file);
}

export async function replaceSectionAsset(
  classId: string,
  sectionId: string,
  assetId: string,
  kind: "video" | "document" | "transcript",
  file: File,
): Promise<void> {
  await deleteSectionAsset(assetId);
  await uploadSectionAsset(classId, sectionId, kind, file);
}

export interface SectionQuestionRow {
  id: string;
  section_id: string;
  type: string;
  topic: string;
  difficulty: string;
  prompt: string;
  options: string[] | null;
  correct_answer: string | null;
  rubric: string | null;
  position: number;
}

export async function listSectionQuestions(sectionId: string): Promise<SectionQuestionRow[]> {
  return listSectionQuestionsFn({ data: { sectionId } });
}

export async function addSectionVideoLink(sectionId: string, url: string): Promise<void> {
  await addSectionVideoLinkFn({ data: { sectionId, url } });
}

export async function deleteSectionAsset(assetId: string): Promise<void> {
  const asset = await getSectionAssetFn({ data: { assetId } });
  if (asset?.storage_bucket && asset.storage_path) {
    await deleteAssetRemote(asset.storage_bucket as AssetBucket, asset.storage_path);
  }
  await deleteSectionAssetFn({ data: { assetId } });
}

export async function getAssetSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const { url } = await getSignedAssetUrlFn({
    data: { bucket: bucket as AssetBucket, storagePath: path, expiresIn },
  });
  return url;
}
