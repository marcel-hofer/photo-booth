import log4js from 'log4js';

const logger = log4js.getLogger();

export default logger;

export function init(config) {
    const logging = config.logging || { };

    log4js.configure({
        appenders: {
            consoleAppender: {
                type: 'console',
                layout: {
                    type: 'pattern',
                    pattern: '%m'
                }
            },
            console: {
                type: 'logLevelFilter',
                appender: 'consoleAppender',
                level: logging.level || 'info'
            },
            fileAppender: {
                type: 'file',
                layout: {
                    type: 'pattern',
                    pattern: '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %m'
                },
                filename: logging.fileName || 'app.log'
            },
            file: {
                type: 'logLevelFilter',
                appender: 'fileAppender',
                level: logging.level || 'info'
            }
        },
        categories: {
            default: {
                appenders: ['console', 'file'],
                level: 'debug'
            }
        }
    })
}