import { CookieJar } from 'tough-cookie';
import { v4 } from 'uuid';

import { LoginAndComplete } from './classes/login.js';
import { QuizOptions } from './interface.js';

if (process.env.verbose?.toLowerCase() === 'false') {
	console.info = function () {};
}

(async () => {
	if (!process.env.wizard_username || !process.env.wizard_password) {
		console.error('Please provide a username and password in the .env file');
		process.exit(1);
	}

	if (!process.env.capsolver) {
		console.error('Please provide a Capsolver API key in the .env file');
		process.exit(1);
	}

	const options: QuizOptions = {
		Cookies: new CookieJar(),
		ID: v4(),
	};
	new LoginAndComplete(options);
})();
