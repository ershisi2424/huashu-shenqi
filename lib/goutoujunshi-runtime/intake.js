const QUESTIONS = [
  ["user", "你希望我怎么称呼你？你的沟通习惯或明确偏好是什么？"],
  ["subject", "这个维护对象可以用什么代号称呼？你已确认的兴趣或近况有哪些？"],
  ["relationship", "你们目前是什么关系、联系多久、最近发生了什么关键变化？"],
  ["goal", "这次更想承接、澄清、推进、修复，还是收线？"],
];

function hasEmergencySignal(message) {
  return /自杀|自残|不想活|活不下去|轻生|威胁|跟踪|曝光隐私|借钱|转账|裸聊|私照/.test(message);
}

export function buildIntake({ profile = {}, currentMessage = "", urgent = false } = {}) {
  const safeProfile = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  if (urgent || hasEmergencySignal(String(currentMessage))) {
    return { needsProfile: false, missingFields: [], questions: [], confirmedProfile: safeProfile, reason: "urgent_first" };
  }
  const missingFields = QUESTIONS.map(([key]) => key).filter((key) => {
    const value = safeProfile[key] ?? safeProfile[`${key}Summary`];
    return !(typeof value === "string" ? value.trim() : value);
  });
  const questions = QUESTIONS.filter(([key]) => missingFields.includes(key)).slice(0, 3).map(([, question]) => question);
  return {
    needsProfile: questions.length > 0,
    missingFields,
    questions,
    confirmedProfile: safeProfile,
    reason: questions.length ? "missing_profile_fields" : "complete",
  };
}
