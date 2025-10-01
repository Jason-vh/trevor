// Logging utility

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}

class Logger {
  log(level: LogLevel, module: string, message: string, metadata?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      module,
      message,
      metadata,
    };

    const formattedMessage = `[${entry.timestamp.toISOString()}] [${level.toUpperCase()}] [${module}] ${message}`;

    switch (level) {
      case 'error':
        console.error(formattedMessage, metadata || '');
        break;
      case 'warn':
        console.warn(formattedMessage, metadata || '');
        break;
      case 'debug':
        console.debug(formattedMessage, metadata || '');
        break;
      default:
        console.log(formattedMessage, metadata || '');
    }
  }

  info(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log('info', module, message, metadata);
  }

  warn(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log('warn', module, message, metadata);
  }

  error(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log('error', module, message, metadata);
  }

  debug(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log('debug', module, message, metadata);
  }
}

export const logger = new Logger();