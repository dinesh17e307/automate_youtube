import type { LlmProvider } from '../interfaces';
import type { TopicCandidate, Script, Scene, Character, ContentCategory } from '@kids-youtube/shared';
import { CONTENT_CATEGORIES } from '@kids-youtube/shared';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';

const SAMPLE_TOPICS: Record<string, { title: string; description: string }[]> = {
  nursery_rhymes: [
    { title: 'Five Little Ducks Swimming', description: 'Count down from five with cute ducklings' },
    { title: 'Twinkle Twinkle Little Star Adventure', description: 'A star guides kids through the night sky' },
  ],
  animals: [
    { title: 'Can You Name These Animals?', description: 'Interactive animal guessing game' },
    { title: 'Animal Sounds Safari', description: 'Learn animal sounds on a fun safari' },
  ],
  colors: [
    { title: 'Learn Colors with Balloons', description: 'Pop colorful balloons and learn color names' },
    { title: 'Rainbow Colors Song', description: 'Sing along with a magical rainbow' },
  ],
  alphabet_learning: [
    { title: 'ABC Animal Song', description: 'Learn letters with animal friends' },
    { title: 'Letter A Adventure', description: 'Discover words starting with A' },
  ],
  numbers_counting: [
    { title: 'Counting 1-10 with Balloons', description: 'Count balloons floating in the sky' },
    { title: 'Five Little Monkeys', description: 'Count monkeys jumping on the bed' },
  ],
  good_habits: [
    { title: 'Brush Your Teeth Song', description: 'Learn the importance of brushing teeth' },
    { title: 'Wash Your Hands', description: 'Fun hand-washing song for kids' },
  ],
};

function getSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export class MockLlmProvider implements LlmProvider {
  name = 'mock';

  async generateTopics(params: {
    categories: ContentCategory[];
    previousTopics: string[];
    seasonality?: string;
    performanceHints?: { category: string; avgRetention: number }[];
    count?: number;
  }): Promise<TopicCandidate[]> {
    const count = params.count || 5;
    const topics: TopicCandidate[] = [];
    const season = params.seasonality || getSeason();

    for (const category of params.categories) {
      const samples = SAMPLE_TOPICS[category] || [
        { title: `Fun ${category.replace(/_/g, ' ')} Song`, description: `An engaging ${category} video for kids` },
      ];

      for (const sample of samples) {
        if (params.previousTopics.includes(sample.title)) continue;

        const perfHint = params.performanceHints?.find((h) => h.category === category);
        const baseScore = 0.5 + Math.random() * 0.3;
        const perfBonus = perfHint ? perfHint.avgRetention * 0.2 : 0;

        topics.push({
          title: sample.title,
          category: category as ContentCategory,
          description: sample.description,
          score: Math.min(baseScore + perfBonus, 1),
          reason: perfHint
            ? `Strong performance in ${category} category (${season} season)`
            : `Good topic diversity for ${category}`,
        });
      }
    }

    return topics
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  async generateScript(params: {
    topic: TopicCandidate;
    targetAge: string;
    durationMin: number;
    durationMax: number;
    language: string;
    visualStyle: string;
  }): Promise<Script> {
    const { topic } = params;
    logger.info(`Generating script for: ${topic.title}`);

    return {
      title: `${topic.title} | Kids Learning Song`,
      description: `${topic.description}. Perfect for children ages ${params.targetAge}. Subscribe for more fun learning videos!`,
      lyrics: this.generateLyrics(topic),
      learningObjective: `Children will learn about ${topic.category.replace(/_/g, ' ')} through fun songs and repetition.`,
      tags: [
        'kids songs',
        'nursery rhymes',
        'kids rhymes',
        'preschool songs',
        'children songs',
        topic.category.replace(/_/g, ' '),
        'learning for kids',
        'educational videos',
      ],
      thumbnailPrompt: `Bright colorful cartoon thumbnail for kids video "${topic.title}", main character Bunny waving, bold text, high contrast, child-friendly ${params.visualStyle}`,
      musicRequirements: 'Happy upbeat children background music, 120 BPM, major key, playful instruments',
    };
  }

  private generateLyrics(topic: TopicCandidate): string {
    return `[Verse 1]
Hello little friends, are you ready to play?
Let's learn about ${topic.category.replace(/_/g, ' ')} today!
Clap your hands and sing along,
This is our happy learning song!

[Chorus]
${topic.title}, ${topic.title},
Sing it loud and sing it clear!
${topic.title}, ${topic.title},
Learning is fun when friends are near!

[Verse 2]
Bunny hops and Ellie sways,
Sunny shines with golden rays!
One, two, three, let's count and see,
What wonderful things we can be!

[Chorus]
${topic.title}, ${topic.title},
Sing it loud and sing it clear!
${topic.title}, ${topic.title},
Learning is fun when friends are near!

[Outro]
Great job everyone, you did so well!
Come back tomorrow for another tale!
Wave goodbye and say hooray,
See you on another learning day!`;
  }

  async generateScenes(params: {
    script: Script;
    characters: Character[];
    targetDuration: number;
    visualStyle: string;
  }): Promise<Scene[]> {
    const { script, characters, targetDuration, visualStyle } = params;
    const bunny = characters.find((c) => c.name === 'Bunny') || characters[0];
    const ellie = characters.find((c) => c.name === 'Ellie') || characters[1] || characters[0];
    const sunny = characters.find((c) => c.name === 'Sunny') || characters[2] || characters[0];

    const sceneCount = config.freeTier ? 3 : 5;
    const sceneDuration = Math.floor(targetDuration / sceneCount);

    const allScenes: Scene[] = [
      {
        sceneNumber: 1,
        title: 'Introduction',
        durationSeconds: sceneDuration,
        characters: [{ characterId: sunny.id, name: sunny.name, action: 'waves at audience with bright smile' }],
        dialogue: 'Hello little friends! Are you ready to sing and learn today?',
        background: 'Colorful playground with rainbow sky',
        music: 'Happy children intro music',
        cameraMovement: 'slow zoom in',
        transition: 'fade',
        visualPrompt: `${visualStyle}, ${sunny.appearance}, waving hello, colorful playground background, bright and cheerful`,
      },
      {
        sceneNumber: 2,
        title: 'Verse 1',
        durationSeconds: sceneDuration,
        characters: [
          { characterId: bunny.id, name: bunny.name, action: 'hops and claps hands' },
          { characterId: ellie.id, name: ellie.name, action: 'sways side to side' },
        ],
        dialogue: 'Hello little friends, are you ready to play? Let\'s learn and sing today!',
        background: 'Green meadow with flowers',
        music: 'Upbeat verse melody',
        cameraMovement: 'pan left to right',
        transition: 'slide',
        visualPrompt: `${visualStyle}, ${bunny.appearance} and ${ellie.appearance}, dancing in meadow, flowers, happy`,
      },
      {
        sceneNumber: 3,
        title: 'Chorus',
        durationSeconds: sceneDuration + 5,
        characters: [
          { characterId: bunny.id, name: bunny.name, action: 'jumps with arms up' },
          { characterId: ellie.id, name: ellie.name, action: 'trumpets with trunk' },
          { characterId: sunny.id, name: sunny.name, action: 'shines brightly above' },
        ],
        dialogue: `${script.title.split('|')[0].trim()}, sing it loud and sing it clear! Learning is fun when friends are near!`,
        background: 'Magical stage with spotlights',
        music: 'Catchy chorus with clapping rhythm',
        cameraMovement: 'zoom out reveal',
        transition: 'dissolve',
        visualPrompt: `${visualStyle}, all characters on stage singing, spotlights, confetti, celebration`,
      },
      {
        sceneNumber: 4,
        title: 'Verse 2',
        durationSeconds: sceneDuration,
        characters: [
          { characterId: bunny.id, name: bunny.name, action: 'counts on fingers' },
          { characterId: ellie.id, name: ellie.name, action: 'points to numbers floating' },
        ],
        dialogue: 'One, two, three, let\'s count and see! What wonderful things we can be!',
        background: 'Classroom with number charts',
        music: 'Playful counting melody',
        cameraMovement: 'static with number animations',
        transition: 'wipe',
        visualPrompt: `${visualStyle}, counting scene, floating numbers 1-2-3, classroom, educational`,
      },
      {
        sceneNumber: 5,
        title: 'Outro',
        durationSeconds: sceneDuration,
        characters: [
          { characterId: bunny.id, name: bunny.name, action: 'waves goodbye' },
          { characterId: ellie.id, name: ellie.name, action: 'waves trunk' },
          { characterId: sunny.id, name: sunny.name, action: 'sets gently' },
        ],
        dialogue: 'Great job everyone! Wave goodbye and say hooray! See you tomorrow!',
        background: 'Sunset sky with stars appearing',
        music: 'Gentle outro melody',
        cameraMovement: 'slow zoom out',
        transition: 'fade to black',
        visualPrompt: `${visualStyle}, characters waving goodbye, sunset, stars, warm farewell scene`,
      },
    ];

    return allScenes.slice(0, sceneCount).map((s, i) => ({ ...s, sceneNumber: i + 1 }));
  }

  async generateShortScript(params: {
    longScript?: Script;
    category: ContentCategory;
    targetAge: string;
  }): Promise<Script> {
    const emoji = params.category === 'animals' ? '🐶🐱🦁🐘🐼' : '🌈✨🎵';
    const title = params.longScript
      ? `Quick Fun: ${params.longScript.title.split('|')[0].trim()} ${emoji}`
      : `Can You Name These 5 Animals? ${emoji}`;

    return {
      title,
      description: `Quick learning fun for kids! #Shorts #KidsLearning #${params.category.replace(/_/g, '')}`,
      lyrics: params.longScript
        ? params.longScript.lyrics.split('\n').slice(0, 8).join('\n')
        : 'Dog goes woof! Cat goes meow! Lion goes roar! Can you name them all?',
      learningObjective: 'Quick interactive learning moment',
      tags: ['shorts', 'kids', params.category.replace(/_/g, ' '), 'learning'],
      thumbnailPrompt: `Vertical 9:16 bright thumbnail, ${title}, bold text, cartoon style`,
      musicRequirements: 'Short upbeat jingle, 5 seconds loop',
    };
  }

  async validateContent(params: {
    script: Script;
    scenes: Scene[];
  }): Promise<{ passed: boolean; issues: string[] }> {
    const issues: string[] = [];
    const blockedWords = ['kill', 'death', 'scary', 'blood', 'weapon', 'hate', 'stupid', 'ugly'];

    const fullText = `${params.script.lyrics} ${params.script.description} ${params.scenes.map((s) => s.dialogue).join(' ')}`.toLowerCase();

    for (const word of blockedWords) {
      if (fullText.includes(word)) {
        issues.push(`Inappropriate word detected: "${word}"`);
      }
    }

    if (params.scenes.length < 2) {
      issues.push('Too few scenes for a complete video');
    }

    if (params.script.lyrics.length < 50) {
      issues.push('Script too short');
    }

    return { passed: issues.length === 0, issues };
  }
}
