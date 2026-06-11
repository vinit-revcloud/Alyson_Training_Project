import { readFileSync } from "node:fs";

const key = readFileSync(".env", "utf8").match(/DEEPSEEK_API_KEY=(.+)/m)[1].trim();

const SYLLABUS_SYSTEM_PROMPT = `You are Alyson. Respond with STRICT JSON only:
{"reply":"...","draft":{"title":"","description":"","topics":[],"sections":[]},"readyToApply":false}`;

const messages = [
  { role: "system", content: SYLLABUS_SYSTEM_PROMPT },
  { role: "user", content: "Draft a 4-section intro to machine learning for business analysts" },
];

const res = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({
    model: "deepseek-chat",
    messages,
    response_format: { type: "json_object" },
    max_tokens: 4096,
    temperature: 0.4,
  }),
});

console.log("HTTP", res.status);
const json = await res.json();
const content = json.choices?.[0]?.message?.content ?? "";
console.log("Content length:", content.length);
console.log("Preview:", content.slice(0, 400));

try {
  JSON.parse(content);
  console.log("JSON parse: OK");
} catch (e) {
  console.log("JSON parse: FAIL", e.message);
}
