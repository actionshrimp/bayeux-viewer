import type { ArgumentData } from '../types';

// "Why it happened": the chain of claims and consequences behind the tapestry.
// Lanes: 'norman' (the Norman case the tapestry was made to tell), 'shown' (what is
// embroidered), 'english' (what English sources say instead). `kind: 'context'` marks
// events that are not embroidered. `scenes` links a node to the strip.
// Columns run in story order so the chart can follow the strip.

export const ARGUMENT: ArgumentData = {
  columns: [
    { id: 'before', label: 'Before 1064', scenes: [0, 0.9] },
    { id: 'voyage', label: 'The voyage', scenes: [1, 5] },
    { id: 'capture', label: 'Capture and rescue', scenes: [6, 15] },
    { id: 'brittany', label: 'Brittany', scenes: [16, 22] },
    { id: 'oath', label: 'The oath', scenes: [23, 23] },
    { id: 'death', label: 'Edward dies', scenes: [24, 28] },
    { id: 'crown', label: 'Harold crowned', scenes: [29, 33] },
    { id: 'response', label: 'William responds', scenes: [34, 47] },
    { id: 'verdict', label: 'The verdict', scenes: [48, 58] },
  ],

  nodes: [
    // Before
    { id: 'childless', col: 'before', lane: 'shown', kind: 'context',
      title: 'Edward has no heir',
      text: 'Edward the Confessor reaches old age without children. At least four men have a claim: Harold, William, Harald Hardrada of Norway and the boy Edgar Ætheling.' },
    { id: 'promise-1051', col: 'before', lane: 'norman', kind: 'context',
      title: 'A promise in 1051?',
      text: 'Norman writers say Edward, raised in exile in Normandy, promised the throne to his cousin William around 1051.' },
    { id: 'hostages', col: 'before', lane: 'english', kind: 'context',
      title: 'Hostages in Normandy',
      text: 'Harold’s brother Wulfnoth and nephew Hakon have been held in Normandy as hostages since 1051.' },

    // Voyage
    { id: 'sent', col: 'voyage', lane: 'shown', scenes: [1, 5],
      title: 'Harold leaves Edward and sails',
      text: 'The tapestry shows Harold speaking with Edward and then sailing, but never says why he went.' },
    { id: 'sent-norman', col: 'voyage', lane: 'norman',
      title: 'Sent to confirm William',
      text: 'William of Poitiers: Edward sent Harold to confirm the promise and swear loyalty to William as heir.' },
    { id: 'sent-english', col: 'voyage', lane: 'english',
      title: 'Went for the hostages',
      text: 'Eadmer of Canterbury: Harold went to free his kinsmen, against Edward’s warning. Later writers say a fishing trip was blown off course.' },

    // Capture
    { id: 'rescued', col: 'capture', lane: 'shown', scenes: [7, 14],
      title: 'Guy seizes Harold, William frees him',
      text: 'Shipwrecked on Guy’s coast, Harold is held for ransom until William demands his release.' },
    { id: 'debt', col: 'capture', lane: 'norman',
      title: 'Harold owes William',
      text: 'By rescuing Harold, William places him under obligation. The story shows William as the generous lord.' },

    // Brittany
    { id: 'campaign', col: 'brittany', lane: 'shown', scenes: [16, 20],
      title: 'Harold fights for William',
      text: 'Harold rides on William’s campaign and heroically pulls men from the quicksand.' },
    { id: 'arms', col: 'brittany', lane: 'shown', scenes: [21, 21],
      title: 'William gives Harold arms',
      text: 'William presents Harold with arms and armour.' },
    { id: 'vassal', col: 'brittany', lane: 'norman',
      title: 'Harold becomes William’s man',
      text: 'Giving arms was a ritual of lordship. In Norman eyes Harold is now William’s vassal and owes him faith.' },

    // Oath
    { id: 'oath', col: 'oath', lane: 'shown', scenes: [23, 23], key: true,
      title: 'Harold swears on holy relics',
      text: 'With a hand on each of two reliquaries, Harold swears an oath to William. The tapestry does not say what he swore.' },
    { id: 'oath-norman', col: 'oath', lane: 'norman', key: true,
      title: 'He swore to support William as king',
      text: 'Norman sources say Harold promised to be William’s representative in England and to secure his succession. Breaking an oath sworn on relics is perjury, a sin against God and the saints.' },
    { id: 'oath-english', col: 'oath', lane: 'english',
      title: 'An oath under duress',
      text: 'English writers suggest Harold was trapped: he could not leave Normandy without swearing, so the oath did not bind him. Some later tales say the relics were hidden under a cloth.' },

    // Death
    { id: 'rebuke', col: 'death', lane: 'shown', scenes: [25, 25],
      title: 'Harold returns to a stern Edward',
      text: 'Edward seems to scold Harold. Eadmer says Edward reminded him he had warned against the trip.' },
    { id: 'deathbed', col: 'death', lane: 'shown', scenes: [27, 28],
      title: 'Dying Edward speaks to his followers',
      text: 'Edward reaches out to a man who is probably Harold. The tapestry does not record his words.' },
    { id: 'bequest', col: 'death', lane: 'english', key: true,
      title: 'Edward names Harold heir',
      text: 'The Anglo-Saxon Chronicle and the Life of King Edward say Edward entrusted the kingdom to Harold on his deathbed. A deathbed bequest was a strong claim in English custom.' },
    { id: 'protect', col: 'death', lane: 'norman',
      title: 'Only a protector',
      text: 'Norman writers either ignore the bequest or treat it as entrusting Harold with care of the realm, not the crown.' },

    // Crown
    { id: 'crowned', col: 'crown', lane: 'shown', scenes: [29, 31],
      title: 'Harold is crowned, Stigand beside him',
      text: 'Harold takes the crown the day after Edward’s death. Archbishop Stigand stands beside the throne.' },
    { id: 'usurper', col: 'crown', lane: 'norman', key: true,
      title: 'A perjured usurper',
      text: 'Harold has broken his oath and seized the crown. Showing Stigand, who had been excommunicated by several popes, hints the coronation was unholy.' },
    { id: 'elected', col: 'crown', lane: 'english',
      title: 'Chosen by the witan',
      text: 'English sources say the great council chose Harold and Archbishop Ealdred of York crowned him in Westminster Abbey.' },
    { id: 'comet', col: 'crown', lane: 'shown', scenes: [32, 33],
      title: 'A comet in April',
      text: 'Halley’s comet appears. Ghostly ships in the border below show what it foretells.' },

    // Response
    { id: 'fleet', col: 'response', lane: 'shown', scenes: [34, 47],
      title: 'William builds a fleet and invades',
      text: 'News crosses the Channel. William orders ships, crosses with men and horses, and lands at Pevensey.' },
    { id: 'banner', col: 'response', lane: 'norman', kind: 'context', key: true,
      title: 'The pope backs William',
      text: 'Not embroidered: Pope Alexander II sends a papal banner. The broken oath turns a land grab into a just war.' },
    { id: 'north', col: 'response', lane: 'english', kind: 'context',
      title: 'Harold fights in the north first',
      text: 'Not embroidered: Harold defeats Harald Hardrada at Stamford Bridge on 25 September, then marches 400 km south to meet William.' },

    // Verdict
    { id: 'death-harold', col: 'verdict', lane: 'shown', scenes: [57, 58], key: true,
      title: 'Harold is killed, the English flee',
      text: 'At the end of the surviving cloth Harold falls and his army breaks. The final scenes are lost.' },
    { id: 'judgement', col: 'verdict', lane: 'norman',
      title: 'God punishes the oath-breaker',
      text: 'For the Normans the outcome proves the case: the perjurer is struck down and William is the rightful king.' },
    { id: 'conquest', col: 'verdict', lane: 'english', kind: 'context',
      title: 'Conquest',
      text: 'William is crowned on Christmas Day 1066. The lost end of the tapestry probably showed it. The English aristocracy is replaced within a generation.' },
  ],

  edges: [
    ['childless', 'promise-1051'], ['childless', 'sent'],
    ['promise-1051', 'sent-norman'], ['hostages', 'sent-english'],
    ['sent', 'rescued'], ['rescued', 'debt'], ['debt', 'vassal'],
    ['rescued', 'campaign'], ['campaign', 'arms'], ['arms', 'vassal'],
    ['vassal', 'oath-norman'], ['campaign', 'oath'], ['oath', 'oath-norman'], ['oath', 'oath-english'],
    ['oath', 'rebuke'], ['rebuke', 'deathbed'], ['deathbed', 'bequest'], ['deathbed', 'protect'],
    ['bequest', 'elected'], ['deathbed', 'crowned'], ['oath-norman', 'usurper'], ['crowned', 'usurper'], ['crowned', 'elected'],
    ['crowned', 'comet'], ['comet', 'fleet'], ['usurper', 'banner'], ['banner', 'fleet'],
    ['crowned', 'north'], ['north', 'death-harold'], ['fleet', 'death-harold'],
    ['death-harold', 'judgement'], ['banner', 'judgement'], ['death-harold', 'conquest'],
  ],
};
