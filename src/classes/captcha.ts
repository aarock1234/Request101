import { EventEmitter } from 'events';
import got, { Response } from 'got';

import { CaptchaProperties, CaptchaRequest, CaptchaResponse } from '../interface.js';
import { sleep } from '../utils/utils.js';

export async function getCaptcha(request: CaptchaRequest): Promise<CaptchaResponse> {
	return new Promise((resolve) => {
		console.log('queued captcha solve (takes up to 60 seconds)');

		const capSolverRequest: CapSolver = new CapSolver(process.env.capsolver ?? '', request);

		capSolverRequest.on('complete', (response: CaptchaResponse) => {
			resolve(response);
		});
	});
}

class CapSolver extends EventEmitter {
	key: string;
	cap: CaptchaRequest = {} as CaptchaRequest;
	properties: CaptchaProperties = {} as CaptchaProperties;
	queueToken: string = '';
	recaptchaResponse: string = '';
	in: string = 'https://api.capsolver.com/createTask';
	out: string = 'https://api.capsolver.com/getTaskResult';
	constructor(key: string, request: CaptchaRequest) {
		super();

		this.key = key;

		this.getCaptcha(request);
	}

	async requestToken(): Promise<string> {
		let token: string;
		let taskType: string = '';

		switch (this.cap.type) {
			case 1:
			case 2:
				taskType = 'ReCaptchaV2TaskProxyLess';
				break;
			case 3:
			case 4:
				taskType = 'ReCaptchaV3TaskProxyLess';
				break;
			case 5:
				taskType = 'HCaptchaTaskProxyLess';
				break;
		}

		const response: Response<string> = await got.post(this.in, {
			json: {
				clientKey: this.key,
				task: {
					type: taskType,
					websiteURL: this.properties.url,
					websiteKey: this.properties.sitekey,
				},
			},
			decompress: true,
		});
		token = JSON.parse(response.body).taskId;

		if (!token) {
			throw new Error('captcha failed to solve (1)');
		}

		return token;
	}

	async getResponse(): Promise<string> {
		let recaptchaResponse: string;
		const response = await got.post(this.out, {
			json: {
				clientKey: this.key,
				taskId: this.queueToken,
			},
		});
		const data = JSON.parse(response.body);

		switch (data.status) {
			case 'processing':
				await sleep(2000);
				return this.getResponse();
			case 'ready':
				recaptchaResponse = data.solution.gRecaptchaResponse;
				break;
			default:
				throw new Error(`captcha failed to solve (2): ${data.status}`);
		}

		return recaptchaResponse;
	}

	async getCaptcha(cap: CaptchaRequest): Promise<boolean> {
		try {
			this.cap = cap;
			this.properties = cap.properties ?? {};
			this.queueToken = await this.requestToken();
			this.recaptchaResponse = await this.getResponse();

			return this.emit('complete', {
				id: cap.id,
				token: this.recaptchaResponse,
			});
		} catch (error) {
			console.error((error as any).message);
			return this.getCaptcha(cap);
		}
	}
}
