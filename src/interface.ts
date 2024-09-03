import { CookieJar } from 'tough-cookie';
export interface QuizOptions {
	Cookies: CookieJar;
	ID: string;
}

export interface CaptchaProperties {
	readonly url?: string; // URL to solve on
	readonly sitekey?: string; // Sitekey to solve on
}

export interface CaptchaRequest {
	readonly id: string;
	readonly type: number; // Type of Captcha
	readonly site: string; // Site for captcha
	readonly properties?: CaptchaProperties; // Properties to the Captcha
}

export interface CaptchaResponse {
	readonly id: string;
	readonly token: string;
}
