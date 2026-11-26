export const ACTIVITY_INTERESTS = [
  "自然",
  "食事",
  "体験",
  "のんびり",
  "アクティブ",
] as const;

export type ActivityInterest = (typeof ACTIVITY_INTERESTS)[number];
export type ActivityParticipantCount = 2 | 3 | 4 | "5+";

export type ActivityTemplate = {
  id: string;
  title: string;
  description: string;
  interestTags: readonly ActivityInterest[];
  minParticipants: number;
  maxParticipants: number | null;
  estimatedCostMinYen: number;
  estimatedCostMaxYen: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
};

export const ACTIVITY_TEMPLATES: readonly ActivityTemplate[] = [
  {
    id: "park-picnic",
    title: "公園ピクニック",
    description: "好きなおやつや飲み物を持ち寄り、会話やミニゲームを楽しむ。",
    interestTags: ["自然"],
    minParticipants: 2,
    maxParticipants: null,
    estimatedCostMinYen: 0,
    estimatedCostMaxYen: 1500,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
  {
    id: "nature-photo-mission",
    title: "自然散策・写真ミッション",
    description: "散策コースを歩きながら、テーマを決めて写真を撮り合う。",
    interestTags: ["自然"],
    minParticipants: 2,
    maxParticipants: null,
    estimatedCostMinYen: 0,
    estimatedCostMaxYen: 1500,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
  {
    id: "cafe-hopping",
    title: "カフェ2軒めぐり",
    description: "近くのカフェを2軒選び、飲み物や雰囲気を比べながら話す。",
    interestTags: ["食事"],
    minParticipants: 2,
    maxParticipants: 4,
    estimatedCostMinYen: 1500,
    estimatedCostMaxYen: 3000,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
  {
    id: "local-snack-walk",
    title: "ご当地おやつの食べ歩き",
    description: "気になるご当地おやつを少しずつ試し、歩ける範囲で食べ比べる。",
    interestTags: ["食事"],
    minParticipants: 2,
    maxParticipants: null,
    estimatedCostMinYen: 1000,
    estimatedCostMaxYen: 3000,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
  {
    id: "craft-workshop",
    title: "クラフト体験",
    description: "作りたいものを選んで手を動かし、完成した作品を持ち帰る。",
    interestTags: ["体験"],
    minParticipants: 2,
    maxParticipants: 4,
    estimatedCostMinYen: 2500,
    estimatedCostMaxYen: 5000,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
  {
    id: "board-game-meetup",
    title: "ボードゲーム会",
    description: "ボードゲームをいくつか選び、休憩を挟みながら遊ぶ。",
    interestTags: ["体験"],
    minParticipants: 2,
    maxParticipants: 4,
    estimatedCostMinYen: 1000,
    estimatedCostMaxYen: 3000,
    durationMinMinutes: 120,
    durationMaxMinutes: 240,
  },
  {
    id: "movie-and-cafe",
    title: "映画鑑賞と感想カフェ",
    description: "映画を見たあと、カフェで印象に残ったシーンを話す。",
    interestTags: ["のんびり"],
    minParticipants: 2,
    maxParticipants: 4,
    estimatedCostMinYen: 2500,
    estimatedCostMaxYen: 5000,
    durationMinMinutes: 180,
    durationMaxMinutes: 240,
  },
  {
    id: "bookstore-and-cafe",
    title: "本屋・カフェで過ごす",
    description: "本屋で気になる本を探し、カフェでゆっくり読む。",
    interestTags: ["のんびり"],
    minParticipants: 2,
    maxParticipants: 4,
    estimatedCostMinYen: 1000,
    estimatedCostMaxYen: 2500,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
  {
    id: "bowling",
    title: "ボウリング",
    description: "数ゲーム遊びながら、休憩を挟んでスコアを楽しむ。",
    interestTags: ["アクティブ"],
    minParticipants: 2,
    maxParticipants: null,
    estimatedCostMinYen: 1500,
    estimatedCostMaxYen: 3500,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
  {
    id: "racket-sports",
    title: "バドミントン・卓球",
    description: "利用できる施設を確認し、ラケット競技を楽しむ。道具や施設利用料は事前に確認する。",
    interestTags: ["アクティブ"],
    minParticipants: 2,
    maxParticipants: null,
    estimatedCostMinYen: 500,
    estimatedCostMaxYen: 2500,
    durationMinMinutes: 120,
    durationMaxMinutes: 180,
  },
];

export function filterActivityTemplates({
  budgetLimitYen,
  participantCount,
  interests,
}: {
  budgetLimitYen: number | null;
  participantCount: ActivityParticipantCount;
  interests: readonly ActivityInterest[];
}): readonly ActivityTemplate[] {
  return ACTIVITY_TEMPLATES.filter((template) => {
    const matchesBudget =
      budgetLimitYen === null ||
      template.estimatedCostMaxYen <= budgetLimitYen;
    const matchesParticipants =
      participantCount === "5+"
        ? template.maxParticipants === null && template.minParticipants <= 5
        : template.minParticipants <= participantCount &&
          (template.maxParticipants === null ||
            template.maxParticipants >= participantCount);
    const matchesInterests =
      interests.length === 0 ||
      interests.some((interest) => template.interestTags.includes(interest));

    return matchesBudget && matchesParticipants && matchesInterests;
  });
}
