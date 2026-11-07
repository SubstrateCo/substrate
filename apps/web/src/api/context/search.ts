import type { contextSearch } from "@startup-os/contracts/context/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const searchContext = ({ data, signal }: ApiInput<z.input<typeof contextSearch>>) =>
  readResult(api.context.search.$post({ json: data }, { init: { signal } }));
