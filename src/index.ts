import consoleStamp from 'console-stamp';
import request from 'request';
import { v4 } from 'uuid';

import { LoginAndComplete } from './classes/login';
import { QuizOptions } from './interface';

consoleStamp(console, 'HH:MM:ss.l' as any);

console.log(process.env);

if (process.env.verbose?.toLowerCase() === 'false') {
	console.info = function () {};
}

(async () => {
	if (!process.env.username || !process.env.password) {
		console.error('Please provide a username and password in the .env file');
		process.exit(1);
	}

	if (!process.env.capsolver) {
		console.error('Please provide a Capsolver API key in the .env file');
		process.exit(1);
	}

	const options: QuizOptions = {
		Cookies: request.jar(),
		ID: v4(),
	};
	new LoginAndComplete(options);
})();
