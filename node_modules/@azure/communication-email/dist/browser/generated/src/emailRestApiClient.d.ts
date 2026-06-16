import * as coreClient from "@azure/core-client";
import { Email } from "./operationsInterfaces/index.js";
import { EmailRestApiClientOptionalParams } from "./models/index.js";
export declare class EmailRestApiClient extends coreClient.ServiceClient {
    endpoint: string;
    apiVersion: string;
    /**
     * Initializes a new instance of the EmailRestApiClient class.
     * @param endpoint The communication resource, for example https://my-resource.communication.azure.com
     * @param options The parameter options
     */
    constructor(endpoint: string, options?: EmailRestApiClientOptionalParams);
    /** A function that adds a policy that sets the api-version (or equivalent) to reflect the library version. */
    private addCustomApiVersionPolicy;
    email: Email;
}
//# sourceMappingURL=emailRestApiClient.d.ts.map