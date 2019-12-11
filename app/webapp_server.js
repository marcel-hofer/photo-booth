/*
 * This file is part of "photo-booth"
 * Copyright (c) 2018 Philipp Trenz
 *
 * For more information on the project go to
 * <https://github.com/philipptrenz/photo-booth>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import fs from 'fs';
import path from 'path';

import booth from './booth.js';
import utils from "./utils.js";
import logger from './logger.js'
import templateService from './template-service.js';
import translationService from './translation-service.js';
import collage from './collage.js';
import printer from './printer.js';

var port = 80;

process.on('uncaughtException', function(err) {
    if (err.errno === 'EACCES') {
		logger.warn('webapp: photo-booth must be run as root to use port 80. '
		+ 'Basically, it\'s not a good idea to run a web server as root, '
		+ 'consider setting up a redirect from port 80 to 8080 on your system');
		port = 8080;
		server.listen(port);
    } else
		logger.error('uncaughtException', err);
});

// server stuff
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var remote = require('electron').remote;

server.listen(port, function () {
	logger.debug('webapp: listening at port %d', port);
});

// Routing
const currentDirectory = path.join(__dirname, '../', 'webapp');
app
	.get('/', applyTemplate('index.html'))
	.get('/index.html', applyTemplate('index.html'))
	.use(express.static(currentDirectory))
	.get('/photos/:path', handlePhotoRequest('/photos/'))
	.get('/photos/tmp/:path', handlePhotoRequest('/photos/tmp/'))
	.get('/layouts/:name', function(req, res, next) {
		try {
			collage.getPlaceholderImage(req.params.name, function(err, layoutPath) {
				if (err) {
					next(err);
				} else {
					res.sendFile(layoutPath);
				}
			});
		} catch (ex) {
			next(ex);
		}
	});

function applyTemplate(templatePath) {
	return function(req, res, next) {
		const filePath = path.join(currentDirectory, templatePath);
		const template = fs.readFileSync(filePath).toString();

		translationService.init(utils.getConfig(), function(error) {
			if (error) {
				next(error);
				return;
			}

			const appliedTemplate = templateService.applyTemplate(template, {
				config: utils.getConfig()
			});

			res.write(appliedTemplate);
			res.end();
		})
	}
}

function handlePhotoRequest(path) {
	return function(req, res) {
		var contentDir = utils.getContentDirectory();
		var filePath = contentDir + path + req.params.path;

		res.sendFile(filePath);
	}
}

// Connect event
io.on('connection', function(socket){
	logger.debug('new client connected', { clientId: socket.id });

	if (utils.getConfig().init.grayscaleMode) {
		io.to(socket.id).emit('use grayscale');
	}

	if (utils.getConfig().webapp.enableRemoteRelease) {
		io.to(socket.id).emit('enable remote release');
	}

	socket.on('disconnect', function() {
		logger.debug('client disconnected', { clientId: socket.id });
	});

	// save mail address
	socket.on('contact address', function(msg){
		var contentDir = utils.getContentDirectory();
		fs.appendFile(contentDir+'/contact-addresses.txt', msg+",\n", function (err) {
			if (err) {
				logger.error('writing contact address to file failed: ', { clientId: socket.id }, err);
			} else {
				logger.debug('contact address added to contact-addresses.txt', { clientId: socket.id }, { msg });
			}
		});
	});

	// send validation result back to this client
	socket.on('authenticate', function(password){
		io.to(socket.id).emit('authenticated', passwordIsValid(password));
	});

	// send photo urls to requesting client
	socket.on('get latest photos', function(){
		logger.debug("requested latest photos by webapp", { clientId: socket.id });

		utils.getRecentImages(utils.getConfig().webapp.maxImages, function(files) {
			if (files) {
				var images = [];
				for (var i = 0; i < files.length; i++) {
					images.push('photos/'+files[i]);
				}

				logger.debug("sending latest photos to webapp", { clientId: socket.id, count: files.length });

				io.to(socket.id).emit('new photos', images);
			} else {
				logger.debug("no files to send", { clientId: socket.id });
			}
		});
	});

	// send validation result back to this client
	socket.on('get_config', function(password){
		if (passwordIsValid(password)) {
			io.to(socket.id).emit('get_config', utils.getConfig() );
		} else {
			io.to(socket.id).emit('get_config', false);
		}

	});

	socket.on('set_config', function(json){
		if (passwordIsValid(json['password'])) {
			logger.warn('set_config', { clientId: socket.id });

			utils.saveConfig(json['config'], function (res) {
				if (res) {
					const newDevToolState = json['config'].init.showDevTools;
					const oldDevToolState = utils.getConfig().init.showDevTools;
					if (newDevToolState != undefined) {

						if (newDevToolState) {
							remote.getGlobal('sharedObj').mainWindow.openDevTools();
						} else {
							remote.getGlobal('sharedObj').mainWindow.closeDevTools();
						}

					}
				}
			});

			if (json['option']) {

				if (json['option'] == 'shutdown'){
					var exec = require('child_process').exec;
					exec("shutdown now", function (error, stdout, stderr) {
						logger.warn('webapp: ', { clientId: socket.id, stdout });
					});

				} else if (json['option'] == 'reboot') {
					// reload electron

					var exec = require('child_process').exec;
					exec("reboot", function (error, stdout, stderr) {
						logger.warn('webapp: ', { clientId: socket.id, stdout });
					});

				} else if (json['option'] == 'exit'){
					// close electron
					var electron = require('electron');
				    var app = electron.remote.app;
					app.exit();
				} else if (json['option'] == 'git-pull'){

					logger.warn("webapp: pulling from git repo", { clientId: socket.id });
					var exec = require('child_process').exec;
					exec("cd "+__dirname+" && git pull", function (error, stdout, stderr) {
						logger.warn("webapp: execute 'git pull'", { clientId: socket.id, stdout });
					});
				}
			}
		} else {
			logger.warn('set_config: password wrong', { clientId: socket.id });
		}
	});

	socket.on('get_download_image', function(path, grayscale){
		logger.debug('get_download_image', { clientId: socket.id, path, grayscale });

		var filename = path.substr(path.indexOf("/")+1);
		utils.convertImageForDownload(filename, grayscale, function(res, path, err) {
			if (res) {
				io.to(socket.id).emit('get_download_image', path);
			} else {
				logger.error('get_download_image', { clientId: socket.id }, err);
				io.to(socket.id).emit('get_download_image_error');
			}
		});
	});

	socket.on('get_download_gif', function(paths, grayscale){
		logger.debug('get_download_gif', { clientId: socket.id, paths, grayscale });

		paths = paths.map(path => path.substr(path.indexOf("/")+1));
		utils.createGifForDownload(paths, grayscale, function(res, path, err) {
			if (res) {
				io.to(socket.id).emit('get_download_gif', path);
			} else {
				logger.error('get_download_gif', { clientId: socket.id }, err);
				io.to(socket.id).emit('get_download_gif_error');
			}
		});
	});

	socket.on('trigger_photo', function(password){
		logger.debug('trigger_photo', { clientId: socket.id });

		if (utils.getConfig().webapp.enableRemoteRelease || passwordIsValid(password)) {
			booth.triggerPhoto(function(success) {
				if (success) {
					io.to(socket.id).emit('trigger_photo_success');
				} else {
					io.to(socket.id).emit('trigger_photo_error');
				}
			});
		}
	});

	socket.on('print_preview', function(layout, images) {
		logger.debug('print_preview', { clientId: socket.id, layout, images });
		const paths = images.map(file => file.substr(file.indexOf("/")+1))
			.map(file => path.join(utils.getPhotosDirectory(), file));
		collage.createPreviewCollage(layout, paths, function(err, imagePath) {
			if (err) {
				logger.error('print_preview error', { clientId: socket.id }, err);
				io.to(socket.id).emit('print_preview_error');
			} else {
				io.to(socket.id).emit('print_preview_success', imagePath);
			}
		});
	});

	socket.on('print', function(layout, images, printCount, password) {
		logger.debug('print', { clientId: socket.id, layout, images, printCount, hasPassword: !!password });
		printCount = printCount == null ? 0 : parseInt(printCount);
		if (printCount >= utils.getConfig().printing.limitPerUser && utils.getConfig().printing.limitPerUser > 0 && !passwordIsValid(password)) {
			logger.debug('print_limit_exceeded', { clientId: socket.id });
			io.to(socket.id).emit('print_error', 'print_limit_exceeded');
			return;
		}

		const paths = images.map(file => file.substr(file.indexOf("/")+1))
			.map(file => path.join(utils.getPhotosDirectory(), file));
		collage.createCollage(layout, paths, function(err, imagePath) {
			if (err) {
				logger.error('print error (collage)', { clientId: socket.id }, err);
				io.to(socket.id).emit('print_error');
			} else {
				logger.info('Printing image ', { clientId: socket.id, imagePath });

				const contentDir = utils.getContentDirectory();
				fs.appendFile(contentDir + '/print-log.txt', 'Print ' + imagePath + '\n', function() { });

				printer.print(imagePath, function(err, jobInfo) {
					let logMessage = 'Print result of ' + imagePath + '\n';

					if (err) {
						logMessage += 'FAILED ' +  err.toString();
						logger.error('print error (send to printer)', { clientId: socket.id }, err);
						io.to(socket.id).emit('print_error');
					} else {
						logMessage += 'SUCCESSFULL ' + JSON.stringify(jobInfo);
						logger.info('Printing successful', { clientId: socket.id, imagePath, jobInfo });
						io.to(socket.id).emit('print_success');
					}

					fs.appendFile(contentDir + '/print-log.txt', logMessage + '\n', function() { });
				});
			}
		});
	});
});

function passwordIsValid(password) {
	if (utils.getConfig() && utils.getConfig().webapp.password) {
		return (password && password == utils.getConfig().webapp.password);
	}
	logger.warn('webapp: getting password from config.json failed');
	return false;
}

/*
 * Module exports for connection
 */
module.exports = {
    sendNewPhoto: function(webFilePath){
    	// send new image url to all
		io.emit('new photos', [webFilePath]);
	}
};