export type GiftAction =
  | "sent"
  | "received"
  | "request_reserve"
  | "assign_reserve"
  | "reserve_sent";
export function mayUpdateGift(
  action: GiftAction,
  rights: {
    giver: boolean;
    receiver: boolean;
    giverStaff: boolean;
    receiverStaff: boolean;
    reserve: boolean;
  },
) {
  if (action === "sent") return rights.giver || rights.giverStaff;
  if (action === "received" || action === "request_reserve")
    return rights.receiver || rights.receiverStaff;
  if (action === "assign_reserve") return rights.receiverStaff;
  return rights.reserve || rights.receiverStaff;
}
