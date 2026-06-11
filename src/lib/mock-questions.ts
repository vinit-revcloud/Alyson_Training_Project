import type { Question } from "./test-types";

export const MOCK_QUESTIONS: Question[] = [
  {
    id: "q1",
    type: "mcq",
    topic: "Statistics",
    difficulty: "easy",
    prompt: "Which measure of central tendency is most affected by outliers?",
    options: ["Mean", "Median", "Mode", "Interquartile range"],
    correctAnswer: "Mean",
  },
  {
    id: "q2",
    type: "mcq",
    topic: "Machine Learning",
    difficulty: "medium",
    prompt: "In a Random Forest, what does bagging refer to?",
    options: [
      "Bootstrap aggregating of training samples",
      "Boosting the weakest learner each round",
      "Selecting the best features only",
      "Pruning trees after training",
    ],
    correctAnswer: "Bootstrap aggregating of training samples",
  },
  {
    id: "q3",
    type: "mcq",
    topic: "Deep Learning",
    difficulty: "hard",
    prompt: "Which technique helps mitigate the vanishing gradient problem in deep networks?",
    options: ["Sigmoid activations", "ReLU + residual connections", "L1 regularization", "Dropout only"],
    correctAnswer: "ReLU + residual connections",
  },
  {
    id: "q4",
    type: "mcq",
    topic: "Python",
    difficulty: "easy",
    prompt: "Which library is primarily used for data manipulation in Python?",
    options: ["NumPy", "Pandas", "Matplotlib", "Scikit-learn"],
    correctAnswer: "Pandas",
  },
  {
    id: "q5",
    type: "mcq",
    topic: "SQL",
    difficulty: "medium",
    prompt: "What does the SQL HAVING clause do?",
    options: [
      "Filters rows before grouping",
      "Filters groups after aggregation",
      "Joins two tables",
      "Limits the number of rows returned",
    ],
    correctAnswer: "Filters groups after aggregation",
  },
  {
    id: "q6",
    type: "subjective",
    topic: "Model Evaluation",
    difficulty: "medium",
    prompt:
      "Explain the bias-variance tradeoff and describe one technique you would use to diagnose each.",
    rubric:
      "Should mention underfitting (high bias), overfitting (high variance), learning curves, cross-validation.",
  },
  {
    id: "q7",
    type: "subjective",
    topic: "Feature Engineering",
    difficulty: "hard",
    prompt:
      "You have a dataset with highly imbalanced classes (99/1). Walk through your approach to building a fair classifier.",
    rubric:
      "Should mention resampling (SMOTE / undersampling), class weights, precision/recall/F1, PR-AUC over ROC-AUC.",
  },
  {
    id: "q8",
    type: "mcq",
    topic: "Statistics",
    difficulty: "medium",
    prompt: "A p-value of 0.03 in a two-sided test at alpha=0.05 means:",
    options: [
      "The null hypothesis is true",
      "We reject the null hypothesis",
      "The effect size is large",
      "The sample is biased",
    ],
    correctAnswer: "We reject the null hypothesis",
  },
];
