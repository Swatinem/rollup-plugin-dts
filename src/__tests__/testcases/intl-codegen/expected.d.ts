interface Messages {
    [identifier: string]: string;
}
interface ILanguage {
    addMessage(identifier: string, message: string): void;
    addMessages(messages: Messages): void;
}
interface Options {
  defaultLocale?: string;
  formats?: any;
}
interface GeneratedCode {
    [fileName: string]: string;
}
declare class IntlCodegen {
    private languages;
    private options;
    constructor(options?: Options);
    constructor(defaultLocale?: string);
    getLanguage(locale: string): ILanguage;
    generateFiles(): GeneratedCode;
    writeFiles(outputDirectory: string): Promise<GeneratedCode>;
}
export default IntlCodegen;
