import { Email } from "../operationsInterfaces/index.js";
import { EmailRestApiClient } from "../emailRestApiClient.js";
import { SimplePollerLike, OperationState } from "@azure/core-lro";
import { EmailGetSendResultOptionalParams, EmailGetSendResultResponse, EmailMessage, EmailSendOptionalParams, EmailSendResponse } from "../models/index.js";
/** Class containing Email operations. */
export declare class EmailImpl implements Email {
    private readonly client;
    /**
     * Initialize a new instance of the class Email class.
     * @param client Reference to the service client
     */
    constructor(client: EmailRestApiClient);
    /**
     * Gets the status of the email send operation.
     * @param operationId ID of the long running operation (GUID) returned from a previous call to send
     *                    email
     * @param options The options parameters.
     */
    getSendResult(operationId: string, options?: EmailGetSendResultOptionalParams): Promise<EmailGetSendResultResponse>;
    /**
     * Queues an email message to be sent to one or more recipients
     * @param message Message payload for sending an email
     * @param options The options parameters.
     */
    beginSend(message: EmailMessage, options?: EmailSendOptionalParams): Promise<SimplePollerLike<OperationState<EmailSendResponse>, EmailSendResponse>>;
    /**
     * Queues an email message to be sent to one or more recipients
     * @param message Message payload for sending an email
     * @param options The options parameters.
     */
    beginSendAndWait(message: EmailMessage, options?: EmailSendOptionalParams): Promise<EmailSendResponse>;
}
//# sourceMappingURL=email.d.ts.map