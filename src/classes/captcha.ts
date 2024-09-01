import { EventEmitter } from 'events';
import requestPromise, { Options } from 'request-promise';

import { CaptchaProperties, CaptchaRequest, CaptchaResponse } from '../interface';
import { sleep } from '../utils/utils';

export async function getCaptcha(request: CaptchaRequest): Promise<CaptchaResponse> {
	return new Promise((resolve) => {
		console.log('Queued Captcha for CapSolver (Wait 15-45 seconds)');

		const capSolverRequest: CapSolver = new CapSolver(process.env.capsolver, request);

		capSolverRequest.on('complete', (response: CaptchaResponse) => {
			resolve(response);
		});
	});
}

class CapSolver extends EventEmitter {
	key: string;
	cap: CaptchaRequest;
	properties: CaptchaProperties;
	queueToken: string;
	recaptchaResponse: string;
	in: string = 'https://api.capsolver.com/createTask';
	out: string = 'https://api.capsolver.com/getTaskResult';
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
				requestOptions.json.task.type = 'ReCaptchaV2TaskProxyLess';
				break;
			case 3:
			case 4:
				requestOptions.json.task.type = 'ReCaptchaV3TaskProxyLess';
				break;
			case 5:
				requestOptions.json.task.type = 'HCaptchaTaskProxyLess';
				break;
		}

		const response: Response = await requestPromise.post(requestOptions);
		token = (response.body as any).taskId;

		!token
			? (() => {
					throw new Error('(CapSolver) Captcha Failed to Solve [1]');
			  })()
			: null;

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
				console.log(response.body);
				throw new Error(
					'(CapSolver) Captcha Failed to Solve [2] (Status: ' +
						(response.body as any).status +
						')'
				);
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
