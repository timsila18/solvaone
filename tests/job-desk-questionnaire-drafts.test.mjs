import test from "node:test";
import assert from "node:assert/strict";
import { questionnaireDrafts, mergeQuestionDrafts } from "../src/lib/job-desk/questionnaire-drafts.ts";
const q = (id,question) => ({id,category:"Information",question});

test("dates, skills and achievements are copied without invented facts", () => {
  const questions = [q("dates","Exact start and end dates?"),q("skills","Which software tools?"),q("results","Measurable achievements?"),q("tsc","TSC registration number and current status?")];
  const drafts = questionnaireDrafts(questions,{experience:[{jobTitle:"Teacher",employer:"School",startDate:"2021",endDate:"",achievements:["Introduced reading groups"]}],skills:["Lesson planning"],certifications:["TSC qualified"]});
  assert.match(drafts.dates.answer,/2021/);
  assert.match(drafts.dates.answer,/End date: Not provided/);
  assert.equal(drafts.dates.missing,true);
  assert.match(drafts.skills.answer,/Specific software and technology tools: Not provided/);
  assert.match(drafts.results.answer,/Introduced reading groups/);
  assert.doesNotMatch(drafts.results.answer,/\d+%/);
  assert.equal(drafts.tsc.missing,true);
  assert.match(drafts.tsc.answer,/Do not infer active registration/);
  assert.equal(questionnaireDrafts([questions[3]],{certifications:["TSC qualified in 2025"]}).tsc.missing,true);
});

test("existing client and admin answers are never overwritten", () => {
  const questions = [q("a","Achievements?"),q("b","Email?")];
  const drafts = questionnaireDrafts(questions,{email:"client@example.com"});
  assert.deepEqual(mergeQuestionDrafts(questions,{a:"Verified answer"},drafts),{a:"Verified answer",b:"client@example.com"});
});

test("unknown personal questions remain missing and answers are size limited", () => {
  const questions = [q("why","Why did you leave your previous employer?"),q("tools","Tools?")];
  const drafts = questionnaireDrafts(questions,{tools:["x".repeat(5000)]});
  assert.equal(drafts.why.missing,true);
  assert.match(drafts.why.answer,/Not provided/);
  assert.equal(drafts.tools.answer.length,4000);
});
