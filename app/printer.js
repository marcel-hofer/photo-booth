import fs from 'fs';

import utils from "./utils.js";
import logger from './logger.js'

const printerConfig = utils.getConfig().printing || { };
const nodePrinter = printerConfig.enabled && !printerConfig.simulate ? require('printer') : null;

class Printer {
    constructor() {
        this.workingStates = ['PENDING', 'PRINTING'];
    }

    print(fileName, callback) {
        if (printerConfig.simulate) {
            logger.debug('Printing is in simulation mode');
            callback(false);
            return;
        }

        if (nodePrinter == null) {
            callback(new Error('Printing not enabled'));
            return;
        }

        const printerError = this._checkPrinter(printerConfig.printer);
        if (printerError != null) {
            callback(printerError);
            return;
        }

        const that = this;
        const fileContent = fs.readFileSync(fileName);
        nodePrinter.printDirect({
            printer: printerConfig.printer,
            data: fileContent,
            type: 'JPEG',
            success: function(jobId) {
                logger.info('Print job queued successfully', { jobId });
                that._checkJob(printerConfig.printer, jobId, callback);
            },
            error: function(err) {
                logger.error('Print job queue failed', { jobId }, err);
                callback(err);
            }
        });
    }

    _checkPrinter(printerName) {
        try {
            const printer = nodePrinter.getPrinter(printerName);
            if (printer == null) {
                return new Error('Printer ' + printerName + ' not found');
            }

            return null;
        } catch (ex) {
            return ex;
        }
    }

    _checkJob(printerName, jobId, callback) {
        let jobInfo = null;
        try {
            jobInfo = nodePrinter.getJob(printerName, jobId);
        } catch (ex) {
            logger.error('Could not get job info', { jobId }, ex);
            callback(ex);
            return;
        }

        if (jobInfo == null) {
            logger.error('Could not get job info', { jobId });
            callback(new Error('Could not get job info'));
            return;
        }

        if (jobInfo.status == null || this.workingStates.some(s => jobInfo.status.indexOf(s) !== -1)) {
            logger.info('Job is no longer in a pending state.', { jobId, status: jobInfo.status });
            callback(false, jobInfo);
            return;
        }

        logger.debug('Job is still in a pending state', { jobId, status: jobInfo.status });
        const that = this;
        setTimeout(function() {
            that._checkJob(printerName, jobId, callback);
        }, 5000);
    }
}

const printer = new Printer();
export { printer as default };