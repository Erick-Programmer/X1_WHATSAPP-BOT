export enum Intent {
  PositiveConfirmation = "positive_confirmation",
  AskPrice = "ask_price",
  AskDelivery = "ask_delivery",
  AskContent = "ask_content",
  AskTargetAudience = "ask_target_audience",
  ObjectionExpensive = "objection_expensive",
  ObjectionThink = "objection_think",
  BuyIntent = "buy_intent",
  StopContact = "stop_contact",
  HumanNeeded = "human_needed",
  Unknown = "unknown",
}

export interface IntentResult {
  intent: Intent;
  confidence: number;
  rawInput: string;
}
