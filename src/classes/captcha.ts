import { EventEmitter } from 'events';
import requestPromise, { Options } from 'request-promise';
import config from '../../config/config';
import { CaptchaProperties, CaptchaRequest, CaptchaResponse } from '../interface';
import { sleep } from '../utils/utils';

export async function getCaptcha(request: CaptchaRequest): Promise<CaptchaResponse> {
	return new Promise((resolve) => {
		console.log('Queued Captcha for CapMonster (Wait 15-45 seconds)');

		const capMonsterRequest: CapMonster = new CapMonster(config.capmonster, request);

		capMonsterRequest.on('complete', (response: CaptchaResponse) => {
			resolve(response);
		});
	});
}

class CapMonster extends EventEmitter {
	key: string;
	cap: CaptchaRequest;
	properties: CaptchaProperties;
	queueToken: string;
	recaptchaResponse: string;
	in: string = 'https://api.capmonster.cloud/createTask';
	out: string = 'https://api.capmonster.cloud/getTaskResult';
	constructor(key: string, request: CaptchaRequest) {
		super();

		this.key = key;

		this.getCaptcha(request);
	}

	async requestToken(): Promise<string> {
		let token: string;
		let requestOptions: Options = {
			url: this.in,
			json: {
				clientKey: this.key,
				task: {
					type: null,
					websiteURL: this.properties.url,
					websiteKey: this.properties.sitekey,
				},
			},
			gzip: true,
			resolveWithFullResponse: true,
		};

		switch (this.cap.type) {
			case 1:
			case 2:
				requestOptions.json.task.type = 'NoCaptchaTask';
				break;
			case 3:
			case 4:
				requestOptions.json.task.type = 'RecaptchaV3TaskProxyless';
				break;
			case 5:
				requestOptions.json.task.type = 'HCaptchaTask';
				break;
		}

		const response: Response = await requestPromise.post(requestOptions);
		token = (response.body as any).taskId;

		!token ? (() => {
			throw new Error('(CapMonster) Captcha Failed to Solve [1]')
		})() : null;

		return token;
	}

	async getResponse(): Promise<string> {
		let recaptchaResponse: string;
		let requestOptions: Options = {
			url: this.out,
			json: {
				clientKey: this.key,
				taskId: this.queueToken,
			},
			gzip: true,
			resolveWithFullResponse: true,
		};

		const response: Response = await requestPromise.post(requestOptions);
		
		switch ((response.body as any).status) {
			case 'processing':
				await sleep(2000);
				return this.getResponse();
			case 'ready':
				recaptchaResponse = (response.body as any).solution.gRecaptchaResponse;
				break;
			default:
				throw new Error('(CapMonster) Captcha Failed to Solve [2]');
		}

		return recaptchaResponse;
	}

	async getCaptcha(cap: CaptchaRequest): Promise<boolean> {
		try {
			this.cap = cap;
			this.properties = cap.properties;
			this.queueToken = await this.requestToken();
			this.recaptchaResponse = await this.getResponse();

			return this.emit('complete', {
				id: cap.id,
				token: this.recaptchaResponse,
			});
		} catch (error) {
			console.error(error.message);
			return this.getCaptcha(cap);
		}
	}
}