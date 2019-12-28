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
import sharp from 'sharp';

import utils from "./utils.js";

const gphoto2 = utils.getConfig().gphoto2.simulate
	? null
	: require('gphoto2');

class Camera {

	constructor() {
	}

	/*
	* Detect and configure camera
	*/
	initialize(callback) {
		if (gphoto2 === null) {
			callback(true);
			return;
		}

		this.GPhoto = new gphoto2.GPhoto2();

		// Negative value or undefined will disable logging, levels 0-4 enable it.
		this.GPhoto.setLogLevel(-1);

		var self = this;
		this.GPhoto.list(function (list) {
			if (list.length === 0) {
				callback(false, 'No camera found', null);
				return;
			}
			self.camera = list[0];

			console.log('gphoto2: Found', self.camera.model);

			if (utils.getConfig().gphoto2.capturetarget) {
				self.camera.setConfigValue('capturetarget', utils.getConfig().gphoto2.capturetarget, function (err) {
					if (err){
						callback(false, 'setting config failed', err);
					} else {
						callback(true);
					}
				});
			}
		});
	}

	isInitialized(){
		return (this.camera !== undefined) || gphoto2 === null;
	}

	isConnected(callback) {
		if (gphoto2 === null) {
			callback(true);
			return;
		}

		this.camera.getConfig(function (err, settings) {
			if (err) {
				if (callback) callback(false, 'connection test failed', err);
			} else {
				self.camera == undefined;	// needs to be reinitialized
				if (callback) callback(true);
			}
		});
	}

	takePicture(callback) {
		if (gphoto2 !== null) {
			this._takePictureWithCamera(callback);
		} else {
			this._createSamplePicture(callback);
		}
	}

	_takePictureWithCamera(callback) {
		var self = this;

		if (self.camera === undefined) {
			callback(-1, 'camera not initialized', null);
			return;
		}

		const keep = utils.getConfig().gphoto2.keep === true ?  true : false;

		self.camera.takePicture({ download: true, keep: keep }, function (err, data) {

			if (err) {
				self.camera = undefined;	// needs to be reinitialized
				callback(-2, 'connection to camera failed', err);
				return;
			}

			self._resizeAndSave(data, callback);
		});
	}

	_createSamplePicture(callback) {
		var self = this;

		console.log('sample picture');

		const timestamp = utils.getTimestamp();
		const watermark = new Buffer(`<svg width="3000" height="2000">
				<rect x="0" y="0" width="3000" height="2000" stroke="transparent" stroke-width="0" fill="#f00" fill-opacity="0.5" />
				<text font-size="300" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#000">${timestamp}</text>
			</svg>`);

		sharp(watermark)
		.jpeg()
		.toBuffer(function (err, data) {
			if (err) {
				callback(-2, 'failed to create sample picture', err);
			} else {
				self._resizeAndSave(data, callback);
			}
		});
	}

	_resizeAndSave(data, callback) {
		const filename = "img_" + utils.getTimestamp() + ".jpg";

		function resizeInternal() {
			const resizedFilePath = utils.getPhotosDirectory() + filename;
			const webFilepath = 'photos/' + "img_" + utils.getTimestamp() + ".jpg";
			const maxImageSize = utils.getConfig().maxImageSize ? utils.getConfig().maxImageSize : 1500;

			sharp(data) // resize image to given maxSize
				.resize(Number(maxImageSize)) // scale width to 1500
				.toFile(resizedFilePath, function(err) {
					if (err) {
						callback(-3, 'resizing image failed', err);
					} else {
						callback(0, resizedFilePath, webFilepath);
					}
				});
		}

		if (utils.getConfig().printing.enabled) {
			const filePath = utils.getFullSizePhotosDirectory() + filename;
			fs.writeFile(filePath, data, function(err) {
				if (err) {
					callback(-3, 'saving hq image failed', err);
				} else {
					resizeInternal();
				}
			});
		} else {
			resizeInternal();
		}
	}
}

/*
 * Module exports for connection
 */
let camera = new Camera();
export { camera as default };