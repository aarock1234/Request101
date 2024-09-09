import { EventEmitter } from 'events';
import { Cookie } from 'tough-cookie';
import got, { Got, Response } from 'got';
import * as cheerio from 'cheerio';

import { getAnswer } from '../answer.js';
import { QuizOptions, CaptchaRequest, CaptchaResponse } from '../interface.js';
import { getCaptcha } from './captcha.js';
import { sleep } from '../utils/utils.js';

interface Answer {
	questionId: string;
	answerId: string;
	tAC: string;
	tFormData: string;
	stk: string;
}

export class Quiz extends EventEmitter {
	options: QuizOptions;
	client: Got;
	id: string;
	quizList: Array<string> = [
		'wizard101:adventuring',
		'wizard101:conjuring',
		'wizard101:magical',
		'wizard101:marleybone',
		'wizard101:mystical',
		'wizard101:spellbinding',
		'wizard101:spells',
		'pirate101:valencia',
		'wizard101:wizard-city',
		'wizard101:zafaria',
	];
	postHeaders = {
		host: 'www.wizard101.com',
		'cache-control': 'max-age=0',
		'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
		'sec-ch-ua-mobile': '?0',
		'upgrade-insecure-requests': '1',
		origin: 'https://www.wizard101.com',
		'content-type': 'application/x-www-form-urlencoded',
		'user-agent':
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) CMAC 2.0.7.03; ANGEL Secure; Chrome/87.0.4280.88 Safari/537.36',
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
		'sec-fetch-site': 'same-origin',
		'sec-fetch-mode': 'navigate',
		'sec-fetch-user': '?1',
		'sec-fetch-dest': 'document',
		referer: 'https://www.wizard101.com/quiz/trivia/game/wizard101-adventuring-trivia',
		'accept-language': 'en-US,en;q=0.9',
	};
	constructor(options: QuizOptions, client: Got) {
		super();

		this.options = options;
		this.id = options.ID;
		this.client = client;

		(async () => {
			for (const quiz of this.quizList) {
				await this.startQuiz(quiz);
			}
		})();
	}

	async parseAnswer(response: Response<string>): Promise<Answer> {
		const $: cheerio.Root = cheerio.load(response.body);
		const question: string = $('.quizQuestion').text();
		const questionId: string = $('#questionId').val() as string;
		if (!question) {
			return {} as Answer;
		}
		console.log(`Found Question [${questionId}]: ${question}`);

		const answer: string = getAnswer(question) || '';
		let answerTextElement: cheerio.Element = {} as cheerio.Element;
		$('.answerText').each((_, answerTextElem) => {
			if ($(answerTextElem).text().includes(answer)) {
				answerTextElement = answerTextElem;
			}
		});
		const answerId: string = $(answerTextElement)
			.parent()
			.children()
			.eq(0)
			.children()
			.eq(1)
			.val() as string;
		console.log(`Found Answer [${answerId}]: ${answer}`);

		const tFormData: string = $('input[name="t:formdata"]').val() as string;
		const tAC: string = $('input[name="t:ac"]').val() as string;
		console.info(`Found 't:formdata' Value: ${tFormData}`);
		console.info(`Found 't:ac' Value: ${tAC}`);

		const cookies: Cookie[] = await this.options.Cookies.getCookies(
			'https://www.wizard101.com/'
		);
		const stk: string = cookies.find((cookie) => cookie.key == 'stk')?.value || '';

		console.info(`Found 'stk' Value: ${stk}`);

		return {
			questionId,
			answerId,
			tAC,
			tFormData,
			stk,
		} as Answer;
	}

	async submitAnswer(answer: Answer): Promise<Response<string>> {
		return this.client.post('https://www.wizard101.com/quiz/trivia.dynamic.quizform.quizform', {
			headers: this.postHeaders,
			form: {
				't:ac': answer.tAC,
				't:submit': '["continue","continue"]',
				stk: answer.stk,
				't:formdata': answer.tFormData,
				questionId: answer.questionId,
				answerId: answer.answerId,
				continue: '',
			},
		});
	}

	async getPopup(): Promise<Answer> {
		console.log('Getting Popup');

		const response: Response<string> = await this.client.get(
			'https://www.wizard101.com/auth/popup/LoginWithCaptcha/game?fpSessionAttribute=QUIZ_SESSION'
		);

		const $: cheerio.Root = cheerio.load(response.body);
		const tFormData = $('input[name="t:formdata"]').val() as string;
		const tAC = $('input[name="t:ac"]').val() as string;
		console.info(`Found 't:formdata' Value: ${tFormData}`);
		console.info(`Found 't:ac' Value: ${tAC}`);

		return {
			tFormData,
			tAC,
		} as Answer;
	}

	async submitLoginCaptcha(tInfo: Answer, captchaToken?: string): Promise<void> {
		if (!captchaToken) {
			console.log('Getting Captcha');

			const captchaRequest: CaptchaRequest = {
				id: this.id,
				type: 2,
				site: 'Wizard101',
				properties: {
					url: 'https://www.wizard101.com/auth/popup/LoginWithCaptcha/game?fpSessionAttribute=QUIZ_SESSION',
					sitekey: '6LfUFE0UAAAAAGoVniwSC9-MtgxlzzAb5dnr9WWY',
				},
			};

			const gRecaptchaResponse: CaptchaResponse = await getCaptcha(captchaRequest);
			captchaToken = gRecaptchaResponse.token;
			console.info(`Got Captcha: ${captchaToken}`);
		}

		const cookies: Cookie[] = await this.options.Cookies.getCookies(
			'https://www.wizard101.com/'
		);
		const stk: string = cookies.find((cookie) => cookie.key == 'stk')?.value || '';

		console.log('Submitting Login Captcha');

		const response: Response<string> = await this.client.post(
			'https://www.wizard101.com/auth/popup/loginwithcaptcha.theform',
			{
				form: {
					't:ac': tInfo.tAC,
					't:submit': 'login',
					stk,
					't:formdata': tInfo.tFormData,
					fpShowRegister: false,
					captchaToken: captchaToken,
					'g-recaptcha-response': captchaToken,
					login: '',
				},
				headers: this.postHeaders,
			}
		);

		if (response.statusCode != 200) {
			console.error('Error Submitting Captcha, retrying...');
			tInfo = await this.getPopup();
			return this.submitLoginCaptcha(tInfo);
		}

		console.log('Successfully Submitted Captcha');
	}

	async startQuiz(quiz: string) {
		console.log(`Starting ${quiz} Quiz`);

		let originalQuiz: string = quiz;
		let game: string = quiz.split(':')[0];
		quiz = quiz.split(':')[1];

		let response: Response<string> = await this.client.get(
			`https://www.wizard101.com/quiz/trivia/game/${game}-${quiz}-trivia`,
			{
				cookieJar: this.options.Cookies,
			}
		);

		if (response.body.includes('Come Back Tomorrow')) {
			console.log('Quiz already completed!');
			return;
		}

		if (!response.body.includes(process.env.wizard_username as string)) {
			console.log('Invalid username/password.');
			process.exit(1);
		}

		let promises: Array<Promise<void>> = [];
		let captchaToken: string = '';

		promises.push(
			new Promise(async (resolve) => {
				const captchaRequest: CaptchaRequest = {
					id: this.id,
					type: 2,
					site: 'Wizard101',
					properties: {
						url: 'https://www.wizard101.com/auth/popup/LoginWithCaptcha/game?fpSessionAttribute=QUIZ_SESSION',
						sitekey: '6LfUFE0UAAAAAGoVniwSC9-MtgxlzzAb5dnr9WWY',
					},
				};

				const gRecaptchaResponse: CaptchaResponse = await getCaptcha(captchaRequest);
				console.info(`Got Captcha: ${gRecaptchaResponse.token}`);
				captchaToken = gRecaptchaResponse.token;
				resolve();
			})
		);

		promises.push(
			new Promise(async (resolve) => {
				let quizDone: boolean = false;
				do {
					const answer: Answer = await this.parseAnswer(response);
					if (!answer.questionId || !answer.answerId) {
						console.log(`Unable to Parse Question in ${quiz} Quiz`);
						return this.startQuiz(originalQuiz);
					}

					await sleep(parseInt(process.env.delay || '1000'));

					response = await this.submitAnswer(answer);

					if (response.body.includes('rewardText')) {
						quizDone = true;
					}
				} while (!quizDone);
				console.log(`Completed ${quiz} quiz`);
				resolve();
			})
		);

		await Promise.all(promises);

		const tInfo: Answer = await this.getPopup();
		await this.submitLoginCaptcha(tInfo, captchaToken);

		response = await this.client.get(
			`https://www.wizard101.com/quiz/trivia/game/${game}-${quiz}-trivia`,
			{
				cookieJar: this.options.Cookies,
			}
		);

		const $: cheerio.Root = cheerio.load(response.body);
		const quizScore: string = $('.quizScore').text();

		console.log(`Submitted ${quiz} quiz: ${quizScore}`);

		return;
	}
}
