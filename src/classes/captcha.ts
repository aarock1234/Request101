import Manager, {
	CaptchaRequest,
	CaptchaResponse,
	Harvester,
} from '@stormeio-llc/harvester-manager';
import { v4 as uuidv4 } from 'uuid';
import config from '../../config/config';

const HarvesterManager: Manager = new Manager();
const captchaBank: Array<CaptchaResponse> = [];
const id: string = uuidv4();

// Creates the harvester
const CapMonsterHarvester: Harvester = {
	id,
	name: '',
	type: 'capmonster',
	site: 'Wizard101',
	maxsolving: 1,
	key: config.capmonster,
};
HarvesterManager.createHarvester(CapMonsterHarvester);

export async function getCaptcha(request: CaptchaRequest): Promise<CaptchaResponse> {
	return new Promise((resolve) => {
		HarvesterManager.enqueueCaptcha(request);
		console.log('Queued Captcha for CapMonster (Wait 15-45 seconds)');

		const captchaInterval = setInterval(() => {
			let captchaIndex: number = captchaBank.findIndex((captcha) => captcha.id == request.id);
			if (captchaBank.length && captchaIndex != -1) {
				const response: CaptchaResponse = captchaBank[captchaIndex];
				captchaBank.splice(captchaIndex, 1);
				clearInterval(captchaInterval);
				resolve(response);
			}
		}, 250);
	});
}

HarvesterManager.on('complete', (response: CaptchaResponse) => {
	console.log(`Captcha ${response.id} Complete`);
	captchaBank.push(response);
});
