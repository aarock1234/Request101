import { EventEmitter } from 'events';
import { Headers, Response } from 'request';
import request, { RequestPromiseAPI } from 'request-promise';
import { getAnswer } from '../answer';
import { QuizOptions } from '../interface';
import cheerio, { CheerioAPI, Element } from 'cheerio';
import { CaptchaRequest, CaptchaResponse } from '@stormeio-llc/harvester-manager';
import { getCaptcha } from './captcha';

interface Answer {
	questionId: string;
	answerId: string;
	tAC: string;
	tFormData: string;
	stk: string;
}

export class Quiz extends EventEmitter {
	options: QuizOptions;
	client: RequestPromiseAPI<any>;
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
	postHeaders: Headers = {
		Host: 'www.wizard101.com',
		'cache-control': 'max-age=0',
		'sec-ch-ua': '" Not;A Brand";v="99", "Google Chrome";v="91", "Chromium";v="91"',
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
	constructor(options: QuizOptions) {
		super();

		this.options = options;
		this.id = options.ID;

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
				referer: 'https://www.wizard101.com/game/trivia',
				'accept-language': 'en-US,en;q=0.9',
			},
		});

		(async () => {
			for (const quiz of this.quizList) {
				await this.startQuiz(quiz);
			}
		})();
	}

	async parseAnswer(response: Response): Promise<Answer> {
		const $: CheerioAPI = cheerio.load(response.body);
		const question: string = $('.quizQuestion').text();
		const questionId: string = $('#questionId').val() as string;
		if (!question) {
			return {} as Answer;
		}
		console.log(`Found Question [${questionId}]: ${question}`);

		const answer: string = getAnswer(question);
		let answerTextElement: Element;
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

		const stk: string =
			this.options.Cookies.getCookies('https://www.wizard101.com/').find(
				(cookie) => cookie.key == 'stk'
			)?.value || '';

		console.info(`Found 'stk' Value: ${stk}`);

		return {
			questionId,
			answerId,
			tAC,
			tFormData,
			stk,
		} as Answer;
	}

	async submitAnswer(answer: Answer): Promise<Response> {
		return this.client.post({
			url: 'https://www.wizard101.com/quiz/trivia.dynamic.quizform.quizform',
			headers: this.postHeaders,
			form: {
				't:ac': answer.tAC,
				't:submit': 'submit',
				stk: answer.stk,
				't:formdata': answer.tFormData,
				questionId: answer.questionId,
				answerId: answer.answerId,
				submit: '',
			},
		});
	}

	async getPopup(): Promise<Answer> {
		console.log('Getting Popup');

		const response: Response = await this.client.get(
			'https://www.wizard101.com/auth/popup/LoginWithCaptcha/game?fpSessionAttribute=QUIZ_SESSION'
		);

		const $: CheerioAPI = cheerio.load(response.body);
		const tFormData = $('input[name="t:formdata"]').val() as string;
		const tAC = $('input[name="t:ac"]').val() as string;
		console.info(`Found 't:formdata' Value: ${tFormData}`);
		console.info(`Found 't:ac' Value: ${tAC}`);

		return {
			tFormData,
			tAC
		} as Answer
	}

	async submitLoginCaptcha(tInfo: Answer): Promise<void> {
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
		console.info(`Got Captcha: ${gRecaptchaResponse.token}`);

		const stk: string =
			this.options.Cookies.getCookies('https://www.wizard101.com/').find(
				(cookie) => cookie.key == 'stk'
			)?.value || '';

		console.log('Submitting Login Captcha');

		const response: Response = await this.client.post({
			url: 'https://www.wizard101.com/auth/popup/loginwithcaptcha.theform',
			form: {
				't:ac': tInfo.tAC,
				't:submit': 'login',
				stk,
				't:formdata': tInfo.tFormData,
				fpShowRegister: false,
				captchaToken: gRecaptchaResponse.token,
				'g-recaptcha-response': gRecaptchaResponse.token,
				login: '',
			},
			headers: this.postHeaders,
		});

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

		let response: Response = await this.client.get(
			`https://www.wizard101.com/quiz/trivia/game/${game}-${quiz}-trivia`
		);

		if (response.body.includes('Come Back Tomorrow')) {
			console.log('Quiz already completed!');
			return;
		}

		let quizDone: boolean = false;

		do {
			const answer: Answer = await this.parseAnswer(response);
			if (!answer.questionId || !answer.answerId) {
				console.log(`Unable to Parse Question in ${quiz} Quiz`);
				return this.startQuiz(originalQuiz);
			}
			response = await this.submitAnswer(answer);

			if (response.body.includes('rewardText')) {
				quizDone = true;
			}
		} while (!quizDone);

		const tInfo: Answer = await this.getPopup();
		await this.submitLoginCaptcha(tInfo);

		response = await this.client.get(
			`https://www.wizard101.com/quiz/trivia/game/wizard101-${quiz}-trivia`
		);

		const $: CheerioAPI = cheerio.load(response.body);
		const quizScore: string = $('.quizScore').text();

		console.log(`Completed ${quiz} Quiz: ${quizScore}`);

		return;
	}
}
