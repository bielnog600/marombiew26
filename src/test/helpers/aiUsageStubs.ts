// Server files are run in a VM with their imports stripped; these pass-through
// stand-ins replace the AI usage logger so tests see the same fetch calls.
export const AI_USAGE_TEST_STUBS = `
const withAiUsage = (_feature, _fn, handler) => handler;
const aiFetch = (url, init) => fetch(url, init);
const setAiUsageActor = () => {};
const setAiUsageStudent = () => {};
const setAiUsageStudentFrom = (body) => body;
const currentAiUsageScope = () => undefined;
const recordAiUsage = () => {};
const anthropicQuantities = () => ({});
const countImageBlocks = () => 0;
`;
