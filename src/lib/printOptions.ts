export interface PrintOptions {
  institution: string;
  preparedBy: string;
  signature: boolean;
  grayscale: boolean;
  showQuality: boolean;
  showComparison: boolean;
  showQuestions: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  institution: '',
  preparedBy: '',
  signature: false,
  grayscale: false,
  showQuality: false,
  showComparison: false,
  showQuestions: false,
};
