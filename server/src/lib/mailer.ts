import { config } from '../config.js';

/**
 * Email delivery, kept behind an interface because the provider is not chosen
 * yet and nothing about the rest of the system depends on which one it is.
 *
 * Default driver is `log`: the link is written to the server log instead of
 * being sent. That is the right development and staging behaviour — it needs no
 * vendor account, no domain verification, and no secret — and it fails loudly
 * rather than silently if it is ever left on in production.
 *
 * Adding Resend/Postmark/SES later is one function in this file.
 */

export interface Mailer {
    sendLoginLink(to: string, link: string): Promise<void>;
    /**
     * Whether mail actually leaves the building. False for the log driver.
     *
     * Exposed so the API can tell the client that enrollment is unavailable
     * rather than returning a cheerful 202 that makes a parent believe cloud save
     * is now protecting their child's progress when no email was ever sent.
     * Reveals nothing about any address: it is the same answer for everyone.
     */
    readonly delivers: boolean;
}

class LogMailer implements Mailer {
    readonly delivers = false;

    async sendLoginLink(to: string, link: string): Promise<void> {
        // Deliberately logged at warn: if this appears in production logs, the
        // mailer is misconfigured and parents are not receiving their links.
        console.warn(`[mailer:log] would email ${to}: ${link}`);
    }
}

class HttpMailer implements Mailer {
    readonly delivers = true;

    constructor(
        private readonly endpoint: string,
        private readonly apiKey: string,
        private readonly from: string,
    ) {}

    async sendLoginLink(to: string, link: string): Promise<void> {
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                from: this.from,
                to: [to],
                subject: 'Your Crow sign-in link',
                text: [
                    'Open this link on the device your child plays on:',
                    '',
                    link,
                    '',
                    'The link works once and expires in 15 minutes.',
                    'If you did not ask for this, you can ignore it.',
                ].join('\n'),
            }),
        });
        if (!response.ok) {
            // Do not include the response body: it can echo the address.
            throw new Error(`mail provider rejected the send (${response.status})`);
        }
    }
}

export function createMailer(): Mailer {
    if (config.mail.driver === 'http') {
        if (!config.mail.endpoint || !config.mail.apiKey) {
            throw new Error('CROW_MAIL_DRIVER=http requires CROW_MAIL_ENDPOINT and CROW_MAIL_API_KEY');
        }
        return new HttpMailer(config.mail.endpoint, config.mail.apiKey, config.mail.from);
    }
    return new LogMailer();
}
