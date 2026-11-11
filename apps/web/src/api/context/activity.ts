import type { contextEntity } from "@substrate/contracts/context/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const getActivity = ({ data, signal }: ApiInput<z.input<typeof contextEntity>>) =>
  readResult(api.context.activity.$get({ query: data }, { init: { signal } }));
