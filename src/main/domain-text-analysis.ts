// craigtrim/axiom#207: whole-ontology analysis stays in the plain Node data process.
import { TextAnalysisService } from "./text-analysis-service";
import { mutatocExecutable } from "./mutatoc-client";
import { StaleTextAnalysisContext } from "../domain/text-analysis-context";
import type {
  TextAnalysisContext,
  TextAnalysisInput,
} from "../shared/text-analysis";

interface RuntimeLocations {
  appPath: string;
  resourcesPath: string;
  packaged: boolean;
}

export class DomainTextAnalysis {
  private locations?: RuntimeLocations;
  private service: TextAnalysisService;

  constructor(context: () => Promise<TextAnalysisContext>) {
    this.service = new TextAnalysisService(
      () => {
        if (!this.locations) throw Error("The data service is not configured.");
        const { appPath, resourcesPath, packaged } = this.locations;
        return mutatocExecutable(appPath, resourcesPath, packaged);
      },
      async () => {
        try {
          return await context();
        } catch (error) {
          if (error instanceof StaleTextAnalysisContext) return undefined;
          throw error;
        }
      },
    );
  }

  configure(locations: RuntimeLocations) {
    this.locations = { ...locations };
  }

  parse(input: TextAnalysisInput) {
    return this.service.parse(input);
  }

  close() {
    this.service.close();
  }
}
