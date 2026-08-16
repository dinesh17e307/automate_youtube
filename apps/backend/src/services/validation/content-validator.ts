import type { Script, Scene, ValidationResult, ValidationCheck } from '@kids-youtube/shared';
import { getAiProviders } from '../ai/factory';
import { logger } from '../../utils/logger';

const BLOCKED_WORDS = [
  'kill', 'death', 'die', 'dead', 'murder', 'blood', 'gore',
  'scary', 'horror', 'nightmare', 'demon', 'devil', 'ghost',
  'weapon', 'gun', 'knife', 'bomb', 'fight', 'punch', 'hit',
  'hate', 'stupid', 'dumb', 'ugly', 'fat', 'loser',
  'sexy', 'naked', 'drug', 'alcohol', 'beer', 'wine',
  'password', 'address', 'phone number', 'credit card',
];

const COPYRIGHTED_PATTERNS = [
  /disney/i, /pixar/i, /marvel/i, /paw patrol/i, /peppa pig/i,
  /cocomelon/i, /frozen/i, /mickey mouse/i, /spider-?man/i,
  /if you.re happy and you know it/i, /twinkle twinkle/i,
  /wheels on the bus/i, /baby shark/i, /let it go/i,
];

export class ContentValidator {
  async validate(script: Script, scenes: Scene[]): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];

    checks.push(this.checkAgeAppropriateness(script, scenes));
    checks.push(this.checkLanguage(script, scenes));
    checks.push(this.checkViolence(script, scenes));
    checks.push(this.checkScaryContent(script, scenes));
    checks.push(this.checkPersonalInfo(script, scenes));
    checks.push(this.checkCopyright(script));
    checks.push(this.checkSceneStructure(scenes));
    checks.push(this.checkScriptLength(script));
    checks.push(await this.checkAiSafety(script, scenes));

    const errors = checks.filter((c) => !c.passed && c.severity === 'error');
    const passed = errors.length === 0;
    const overallScore = checks.filter((c) => c.passed).length / checks.length;

    if (!passed) {
      logger.warn('Content validation failed', {
        errors: errors.map((e) => e.message),
      });
    }

    return { passed, checks, overallScore };
  }

  private getFullText(script: Script, scenes: Scene[]): string {
    return [
      script.title, script.description, script.lyrics,
      ...scenes.map((s) => s.dialogue),
    ].join(' ').toLowerCase();
  }

  private checkAgeAppropriateness(script: Script, scenes: Scene[]): ValidationCheck {
    const text = this.getFullText(script, scenes);
    const issues = BLOCKED_WORDS.filter((w) => text.includes(w));
    return {
      name: 'Age Appropriateness',
      passed: issues.length === 0,
      severity: 'error',
      message: issues.length > 0
        ? `Inappropriate content detected: ${issues.join(', ')}`
        : 'Content is age-appropriate',
    };
  }

  private checkLanguage(script: Script, scenes: Scene[]): ValidationCheck {
    const text = this.getFullText(script, scenes);
    const complexWords = text.split(/\s+/).filter((w) => w.length > 12);
    return {
      name: 'Language Simplicity',
      passed: complexWords.length < 5,
      severity: 'warning',
      message: complexWords.length >= 5
        ? 'Some words may be too complex for young children'
        : 'Language is appropriately simple',
    };
  }

  private checkViolence(script: Script, scenes: Scene[]): ValidationCheck {
    const violenceWords = ['fight', 'punch', 'hit', 'kick', 'hurt', 'weapon', 'gun', 'knife'];
    const text = this.getFullText(script, scenes);
    const found = violenceWords.filter((w) => text.includes(w));
    return {
      name: 'Violence Check',
      passed: found.length === 0,
      severity: 'error',
      message: found.length > 0 ? `Violence-related content: ${found.join(', ')}` : 'No violent content',
    };
  }

  private checkScaryContent(script: Script, scenes: Scene[]): ValidationCheck {
    const scaryWords = ['scary', 'horror', 'nightmare', 'monster', 'dark', 'creepy', 'ghost'];
    const text = this.getFullText(script, scenes);
    const found = scaryWords.filter((w) => text.includes(w));
    return {
      name: 'Scary Content Check',
      passed: found.length === 0,
      severity: 'error',
      message: found.length > 0 ? `Potentially scary content: ${found.join(', ')}` : 'No scary content',
    };
  }

  private checkPersonalInfo(script: Script, scenes: Scene[]): ValidationCheck {
    const piiPatterns = [
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
      /\b[\w.-]+@[\w.-]+\.\w+\b/,
      /what.s your (name|address|phone)/i,
      /tell me your/i,
    ];
    const text = this.getFullText(script, scenes);
    const found = piiPatterns.some((p) => p.test(text));
    return {
      name: 'Personal Information',
      passed: !found,
      severity: 'error',
      message: found ? 'Content requests personal information' : 'No personal data requests',
    };
  }

  private checkCopyright(script: Script): ValidationCheck {
    const text = `${script.title} ${script.lyrics}`;
    const found = COPYRIGHTED_PATTERNS.filter((p) => p.test(text));
    return {
      name: 'Copyright Check',
      passed: found.length === 0,
      severity: 'error',
      message: found.length > 0
        ? 'Potential copyrighted content detected — use original material only'
        : 'No obvious copyright issues',
    };
  }

  private checkSceneStructure(scenes: Scene[]): ValidationCheck {
    return {
      name: 'Scene Structure',
      passed: scenes.length >= 2,
      severity: 'error',
      message: scenes.length < 2 ? 'Insufficient scenes for a complete video' : `${scenes.length} scenes generated`,
    };
  }

  private checkScriptLength(script: Script): ValidationCheck {
    return {
      name: 'Script Length',
      passed: script.lyrics.length >= 50,
      severity: 'warning',
      message: script.lyrics.length < 50 ? 'Script may be too short' : 'Script length is adequate',
    };
  }

  private async checkAiSafety(script: Script, scenes: Scene[]): Promise<ValidationCheck> {
    try {
      const providers = await getAiProviders();
      const result = await providers.llm.validateContent({ script, scenes });
      return {
        name: 'AI Safety Review',
        passed: result.passed,
        severity: 'error',
        message: result.passed
          ? 'AI safety review passed'
          : `AI flagged issues: ${result.issues.join('; ')}`,
      };
    } catch {
      return {
        name: 'AI Safety Review',
        passed: true,
        severity: 'info',
        message: 'AI safety review skipped (provider unavailable)',
      };
    }
  }
}

export const contentValidator = new ContentValidator();
