import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import got, { Got, Response } from 'got';
import * as cheerio from 'cheerio';

import { QuizOptions } from '../interface.js';
import { getCaptcha } from './captcha.js';
import { CaptchaRequest, CaptchaResponse } from '../interface.js';
import { Quiz } from './quiz.js';

export class LoginAndComplete extends EventEmitter {
	options: QuizOptions;
	client: Got;
	id: string = uuidv4();
	tAC: string = '';
	stk: string = '';
	tFormData: string = '';
	gRecaptchaResponse: CaptchaResponse = {} as CaptchaResponse;
	postHeaders = {
		Host: 'www.wizard101.com',
		'content-type': 'application/x-www-form-urlencoded',
		'cache-control': 'max-age=0',
		'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
		'sec-ch-ua-mobile': '?0',
		'upgrade-insecure-requests': '1',
		'user-agent':
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
		'sec-fetch-site': 'same-origin',
		'sec-fetch-mode': 'navigate',
		'sec-fetch-user': '?1',
		'sec-fetch-dest': 'document',
		referer: 'https://www.wizard101.com/game',
		'accept-language': 'en-US,en;q=0.9',
	};
	constructor(options: QuizOptions) {
		super();

		this.options = options;

		this.client = got.extend({
			cookieJar: options.Cookies,
			decompress: true,
			headers: {
				Host: 'www.wizard101.com',
				'cache-control': 'max-age=0',
				'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
				'sec-ch-ua-mobile': '?0',
				'upgrade-insecure-requests': '1',
				'user-agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
				accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
				'sec-fetch-site': 'same-origin',
				'sec-fetch-mode': 'navigate',
				'sec-fetch-user': '?1',
				'sec-fetch-dest': 'document',
				referer: 'https://www.wizard101.com/game',
				'accept-language': 'en-US,en;q=0.9',
			},
		});

		this.flow();
	}

	async getHomepage(): Promise<void> {
		console.log('getting homepage');

		const response = await this.client.get('https://www.wizard101.com/game', {
			cookieJar: this.options.Cookies,
		});

		const $: cheerio.Root = cheerio.load(response.body);
		this.tFormData = $('input[name="t:formdata"]').val() as string;
		this.tAC = $('input[name="t:ac"]').val() as string;
		this.stk =
			response.headers['set-cookie']?.find((cookie: string) => cookie.includes('stk')) ?? '';

		console.info(`found 't:stk' value: ${this.stk ?? ''}`);
		console.info(`found 't:formdata' value: ${this.tFormData}`);
		console.info(`found 't:ac' value: ${this.tAC}`);
	}

	async submitLogin(): Promise<boolean> {
		console.log('submitting login for user: ' + process.env.wizard_username);

		const response: Response<string> = await this.client.post(
			'https://www.wizard101.com/home2.dynamic.sidemenuwizard.loginform',
			{
				form: {
					't:ac': this.tAC,
					't:submit': '["",""]',
					stk: this.stk ?? '',
					't:formdata': this.tFormData,
					redirectUrl: 'https://www.wizard101.com/game',
					loginUserName: process.env.wizard_username,
					loginPassword: process.env.wizard_password,
				},
				headers: this.postHeaders,
			}
		);

		if (response.statusCode != 200) {
			console.error('error submitting login, retrying...');
			return this.submitLogin();
		}

		if (response.headers['set-cookie']?.find((cookie) => cookie.includes('LOGIN_FAILURE'))) {
			console.error('failed to login!');
			process.exit(1);
		}

		if (response.body.includes(process.env.wizard_username as string)) {
			console.log('successfully logged in!');
			return true;
		}

		return false;
	}

	async getPopup(): Promise<void> {
		console.log('getting login captcha popup');

		const response: Response<string> = await this.client.get(
			'https://www.wizard101.com/auth/popup/QuarantinedLogin/game?fpRedirectUrl=%2Fgame&reset=1&fpPopup=1',
			{
				cookieJar: this.options.Cookies,
			}
		);

		const $: cheerio.Root = cheerio.load(response.body);
		this.tFormData = $('input[name="t:formdata"]').val() as string;
		this.tAC = $('input[name="t:ac"]').val() as string;
		console.info(`found 't:formdata' value: ${this.tFormData}`);
		console.info(`found 't:ac' value: ${this.tAC}`);
	}

	async submitLoginCaptcha(): Promise<void> {
		console.log('getting captcha');

		const captchaRequest: CaptchaRequest = {
			id: this.id,
			type: 1,
			site: 'Wizard101',
			properties: {
				url: 'https://www.wizard101.com/auth/popup/QuarantinedLogin/game?fpRedirectUrl=%2Fgame&reset=1&fpPopup=1',
				sitekey: '6Ld7GE0UAAAAALWZbnuhqYTBkobv6Whzl7256dQt',
			},
		};

		this.gRecaptchaResponse = await getCaptcha(captchaRequest);
		console.info(`got captcha: ${this.gRecaptchaResponse.token}`);

		console.log('submitting login captcha');

		const response: Response<string> = await this.client.post(
			'https://www.wizard101.com/auth/popup/quarantinedlogin.theform',
			{
				form: {
					't:ac': 'game',
					't:submit': '["login","login"]',
					stk: this.stk ?? '',
					't:formdata': this.tFormData,
					loginSuccessTargetPopup: 'false',
					loginSuccessTargetUrl: 'https://www.wizard101.com/game',
					loginFailureTargetPopup: 'false',
					loginFailureTargetUrl: 'https://www.wizard101.com/game?fpShowRegister=false',
					captchaToken: this.gRecaptchaResponse.token,
					'g-recaptcha-response': this.gRecaptchaResponse.token,
					login: '',
				},
				headers: this.postHeaders,
			}
		);

		if (response.statusCode != 200) {
			console.error('error submitting login, retrying...');
			this.getPopup();
			return this.submitLoginCaptcha();
		}

		console.log('successfully submitted captcha');
	}

	async flow() {
		await this.getHomepage();
		if (!(await this.submitLogin())) {
			await this.getPopup();
			await this.submitLoginCaptcha();
		}
		await this.getHomepage();

		new Quiz(this.options, this.client);
	}
}
