// 발음 채점: 정답 문장과 들린 문장을 단어 단위 LCS로 맞춰 본다
(function (root) {
  const NUM = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };

  function norm(s) {
    return String(s).toLowerCase().replace(/[’‘`]/g, "'")
      .replace(/\b([ap])\.\s?m\b\.?/g, '$1m').replace(/(\d)(am|pm)\b/g, '$1 $2')
      .replace(/\bwon't\b/g, 'will not').replace(/\bcan't\b/g, 'can not').replace(/\bcannot\b/g, 'can not')
      .replace(/n't\b/g, ' not').replace(/'re\b/g, ' are').replace(/'m\b/g, ' am').replace(/'ll\b/g, ' will')
      .replace(/'ve\b/g, ' have').replace(/'d\b/g, ' would').replace(/'s\b/g, ' is')
      .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(w => NUM[w] || w);
  }

  // → { pct: 0~100, marks: [{ w: 원문 단어, ok: 맞게 들렸는지 }] }
  function score(target, spoken) {
    const toks = String(target).split(/\s+/).filter(Boolean);
    const flat = [];
    toks.forEach((t, i) => norm(t).forEach(w => flat.push([w, i])));
    const a = flat.map(x => x[0]), b = norm(spoken), n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const hit = new Array(n).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i] === b[j]) { hit[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    const marks = toks.map((w, i) => ({ w, ok: flat.every(([, o], k) => o !== i || hit[k]) }));
    return { pct: n + m ? Math.round((200 * dp[0][0]) / (n + m)) : 0, marks };
  }

  const api = { norm, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
