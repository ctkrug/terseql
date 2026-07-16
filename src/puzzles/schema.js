/**
 * @typedef {Object} Fixture
 * @property {string} name - short identifier shown in failure messages, e.g. "hidden-2"
 * @property {string} setupSql - CREATE TABLE + INSERT statements that seed this fixture's DB
 * @property {{columns: string[], values: any[][]}} expected - the exact result the solution query produces
 */

/**
 * @typedef {Object} Puzzle
 * @property {string} id - stable slug, e.g. "2026-07-16"
 * @property {string} title
 * @property {string} prompt - plain-English goal shown to the player
 * @property {string} schemaSql - CREATE TABLE statements shown to the player as reference
 * @property {string} previewSetupSql - schema + small visible sample data used for the live preview
 * @property {Fixture[]} fixtures - hidden test fixtures the grader checks; index 0 may equal the preview
 */

/**
 * Minimal shape check for a puzzle definition — enough to catch a malformed
 * puzzle file at load time instead of failing confusingly mid-grade.
 * @param {Puzzle} puzzle
 * @returns {string[]} list of problems; empty means the puzzle is well-formed
 */
export function validatePuzzle(puzzle) {
  const problems = [];
  if (!puzzle?.id) problems.push("missing id");
  if (!puzzle?.title) problems.push("missing title");
  if (!puzzle?.prompt) problems.push("missing prompt");
  if (!puzzle?.schemaSql) problems.push("missing schemaSql");
  if (!puzzle?.previewSetupSql) problems.push("missing previewSetupSql");
  if (!Array.isArray(puzzle?.fixtures) || puzzle.fixtures.length === 0) {
    problems.push("must have at least one fixture");
  } else {
    puzzle.fixtures.forEach((fixture, i) => {
      if (!fixture.name) problems.push(`fixtures[${i}] missing name`);
      if (!fixture.setupSql) problems.push(`fixtures[${i}] missing setupSql`);
      if (!fixture.expected) problems.push(`fixtures[${i}] missing expected`);
    });
  }
  return problems;
}
