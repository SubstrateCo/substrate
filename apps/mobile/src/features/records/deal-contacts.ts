type Participants = { ids: string[]; primary: string | null };

export function removeDealContact(current: Participants, id: string): Participants {
  return {
    ids: current.ids.filter((value) => value !== id),
    primary: current.primary === id ? null : current.primary,
  };
}

export function selectDealPrimary(current: Participants, id: string | null): Participants {
  return {
    ids: id && !current.ids.includes(id) ? [...current.ids, id] : current.ids,
    primary: id,
  };
}
