import type { contextSearch } from "@substrate/contracts/context/input";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const searchContext = ({ data, signal }: ApiInput<z.input<typeof contextSearch>>) =>
  readResult(api.context.search.$post({ json: data }, { init: { signal } }));
