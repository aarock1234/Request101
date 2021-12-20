import { CookieJar } from 'request';

export interface QuizOptions {
    Cookies: CookieJar;
    ID: string;
}