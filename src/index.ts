import consoleStamp from 'console-stamp';
import request from 'request';
import { v4 } from 'uuid';
import config from '../config/config';
import { LoginAndComplete } from './classes/login';
import { QuizOptions } from './interface';

consoleStamp(console, 'HH:MM:ss.l' as any);

if (!config.verbose) {
	console.info = function() {}
}

(async () => {
	const options: QuizOptions = {
		Cookies: request.jar(),
		ID: v4(),
	};
	new LoginAndComplete(options);
})();
