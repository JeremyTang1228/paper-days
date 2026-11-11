/** 静态中英双语短句库：不建表、不请求 API；用户手动切换的偏移存本地偏好 */
export interface DailyQuote {
  topic: string
  zh: string
  en: string
}

export const QUOTES: DailyQuote[] = [
  { topic: '专注当下', zh: '先看清眼前这一件事，其余的可以稍后再说。', en: 'Look at the one thing in front of you. The rest can wait.' },
  { topic: '行动与开始', zh: '不必一次完成所有事情，先把眼前这一步走好。', en: "You don't have to do everything at once. Just take the next step well." },
  { topic: '行动与开始', zh: '开始得很小也没关系，开始本身就是进展。', en: 'Starting small is fine. Starting is progress.' },
  { topic: '耐心和成长', zh: '慢慢来，大多数好东西都是一点点长出来的。', en: 'Take your time. Most good things grow a little at a time.' },
  { topic: '接纳不完美', zh: '今天没做完的，明天依然可以继续。', en: "What you didn't finish today will still be here tomorrow." },
  { topic: '接纳不完美', zh: '完成一半，也是在向前。', en: 'Halfway done is still moving forward.' },
  { topic: '休息与平衡', zh: '累了就停一停，休息也是在照顾接下来的自己。', en: "Pause when you're tired. Rest looks after the person you'll be next." },
  { topic: '休息与平衡', zh: '留一点空白给自己，不必把每个小时都填满。', en: 'Leave some room for yourself. Not every hour needs a task.' },
  { topic: '重新开始', zh: '隔了几天也没关系，今天就是一个好的起点。', en: "A few days away doesn't matter. Today is a fine place to begin." },
  { topic: '重新开始', zh: '不需要补齐过去，只要从这一刻继续。', en: "You don't have to catch up on the past. Just continue from here." },
  { topic: '专注当下', zh: '一次只做一件事，心会安静很多。', en: 'One thing at a time makes the mind quieter.' },
  { topic: '耐心和成长', zh: '进步常常很安静，回头看时才会发现。', en: 'Progress is often quiet. You notice it when you look back.' },
  { topic: '行动与开始', zh: '写下来，就已经比放在脑子里轻了一点。', en: 'Writing it down already makes it a little lighter.' },
  { topic: '接纳不完美', zh: '今天的状态，足够做今天的事。', en: "How you are today is enough for today's work." },
]

/** 按日期取一句（同一天固定，可通过 offset 手动切换） */
export const quoteFor = (date: string, offset = 0): DailyQuote => {
  const base = Math.floor(parseISODate(date).getTime() / 86400000)
  const i = (((base + offset) % QUOTES.length) + QUOTES.length) % QUOTES.length
  return QUOTES[i]
}

const parseISODate = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}
