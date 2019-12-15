import log4js from 'log4js';

const logger = log4js.getLogger();

export default logger;

export function init(config, appStartTime) {
    // appStartTime with multiFile appender will create one file per app run
    logger.addContext("appStartTime", appStartTime);

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
                type: 'multiFile',
                layout: {
                    type: 'pattern',
                    pattern: '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %m'
                },
                base: logging.fileName || 'content/logs',
                property: 'appStartTime',
                extension: '.log'
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