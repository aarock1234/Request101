import { EventEmitter } from 'events';
import { Headers, Response } from 'request';
import request, { RequestPromiseAPI } from 'request-promise';
import cheerio, { CheerioAPI } from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { QuizOptions } from '../interface';
import { getCaptcha } from './captcha';
import { CaptchaRequest, CaptchaResponse } from '../interface';

import config from '../../config/config';
import { Quiz } from './quiz';

export class LoginAndComplete extends EventEmitter {
	options: QuizOptions;
	client: RequestPromiseAPI<any>;
	id: string = uuidv4();
	tAC: string;
	tFormData: string;
	gRecaptchaResponse: CaptchaResponse;
	postHeaders: Headers = {
		Host: 'www.wizard101.com',
		'content-type': 'application/x-www-form-urlencoded',
		'cache-control': 'max-age=0',
		'sec-ch-ua': '" Not;A Brand";v="99", "Google Chrome";v="91", "Chromium";v="91"',
		'sec-ch-ua-mobile': '?0',
		'upgrade-insecure-requests': '1',
		'user-agent':
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.106 Safari/537.36',
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

		this.client = request.defaults({
			jar: options.Cookies,
			followAllRedirects: true,
			resolveWithFullResponse: true,
			simple: false,
			gzip: true,
			headers: {
				Host: 'www.wizard101.com',
				'cache-control': 'max-age=0',
				'sec-ch-ua': '" Not;A Brand";v="99", "Google Chrome";v="91", "Chromium";v="91"',
				'sec-ch-ua-mobile': '?0',
				'upgrade-insecure-requests': '1',
				'user-agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.106 Safari/537.36',
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
		console.log('Getting Homepage');

		const response: Response = await this.client.get('https://www.wizard101.com/game');

		const $: CheerioAPI = cheerio.load(response.body);
		this.tFormData = $('input[name="t:formdata"]').val() as string;
		this.tAC = $('input[name="t:ac"]').val() as string;
		console.info(`Found 't:formdata' Value: ${this.tFormData}`);
		console.info(`Found 't:ac' Value: ${this.tAC}`);
	}

	async submitLogin(): Promise<void> {
		console.log('Submitting Login');

		const response: Response = await this.client.post({
			url: 'https://www.wizard101.com/home2.dynamic.sidemenuwizard.loginform',
			form: {
				't:ac': this.tAC,
				't:submit': '',
				stk: '',
				't:formdata': this.tFormData,
				redirectUrl: 'https://www.wizard101.com/game?reset=1',
				loginUserName: config.username,
				loginPassword: config.password,
			},
			headers: this.postHeaders,
		});

		if (response.statusCode != 200) {
			console.error('Error Submitting Login, retrying...');
			return this.submitLogin();
		}

		if (response.body.includes(config.username)) {
			console.log('Successfully Logged in!');
		} else {
			console.log('Invalid username/password.');
			process.exit(1);
		}
	}

	async getPopup(): Promise<void> {
		console.log('Getting Popup');

		const response: Response = await this.client.get(
			'https://www.wizard101.com/auth/popup/QuarantinedLogin/game?fpRedirectUrl=%2Fgame&reset=1&fpPopup=1'
		);

		const $: CheerioAPI = cheerio.load(response.body);
		this.tFormData = $('input[name="t:formdata"]').val() as string;
		this.tAC = $('input[name="t:ac"]').val() as string;
		console.info(`Found 't:formdata' Value: ${this.tFormData}`);
		console.info(`Found 't:ac' Value: ${this.tAC}`);
	}

	async submitLoginCaptcha(): Promise<void> {
		console.log('Getting Captcha');

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
		console.info(`Got Captcha: ${this.gRecaptchaResponse.token}`);

		console.log('Submitting Login Captcha');

		const response: Response = await this.client.post({
			url: 'https://www.wizard101.com/auth/popup/quarantinedlogin.theform',
			form: {
				't:ac': this.tAC,
				't:submit': 'login',
				stk: '',
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
		});

		if (response.statusCode != 200) {
			console.error('Error Submitting Login, retrying...');
			this.getPopup();
			return this.submitLoginCaptcha();
		}

		console.log('Successfully Submitted Captcha');
	}

	async flow() {
		await this.getPopup();
		await this.submitLoginCaptcha();
		await this.getHomepage();
		await this.submitLogin();

		new Quiz(this.options);
	}
}
