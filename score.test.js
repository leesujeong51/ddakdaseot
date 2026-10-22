// 실행: node score.test.js
const assert = require('node:assert');
const { score, norm } = require('./score.js');
const DAYS = require('./data.js');

assert.equal(score("I'm late.", 'I am late').pct, 100);
assert.equal(score('The meeting was moved to 3 p.m.', 'the meeting was moved to 3 PM').pct, 100);
assert.equal(score('The meeting was moved to 3 p.m.', 'the meeting was moved to three pm').pct, 100);
assert.equal(score("I haven't heard the news yet.", 'I have not heard the news yet').pct, 100);
assert.equal(score('What time does check-in start?', 'what time does check in start').pct, 100);

const r = score('What are you planning to do this weekend?', 'what are you planning to do the weekend');
assert.ok(r.pct > 70 && r.pct < 100, r.pct);
assert.equal(r.marks.find(x => x.w === 'this').ok, false);
assert.equal(r.marks.find(x => x.w === 'weekend?').ok, true);

assert.equal(score('Hello there', '').pct, 0);
assert.deepEqual(norm('three pm'), ['3', 'pm']);

for (const day of DAYS) {
  assert.equal(day.length, 5);
  for (const s of day) {
    assert.equal(s.length, 4);
    assert.equal(score(s[1], s[1]).pct, 100, s[1]);
  }
}
console.log('ok');
