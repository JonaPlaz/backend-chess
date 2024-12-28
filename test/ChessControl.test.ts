import { expect } from "chai";
import hre from "hardhat";
import { ChessControl } from "../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// Constantes
const resign_const = 0x3000;
const inconclusive_outcome = 0x0;
const white_win_outcome = 0x2;
const black_win_outcome = 0x3;

function encodeMove(from: number, to: number): number {
  // 6 bits pour 'from', 6 bits pour 'to'
  return (from << 6) | to;
}

async function deployChessControlFixture() {
  const ChessControl = await hre.ethers.deployContract("ChessControl");
  return { deployedContract: ChessControl };
}

/**
 * 1. Tests utilisant la fonction checkGameFromStart (avec un tableau moves)
 */
describe("ChessControl - checkGameFromStart outcomes", function () {
  let deployedContract: ChessControl;

  beforeEach(async function () {
    const { deployedContract: contract } = await loadFixture(
      deployChessControlFixture
    );
    deployedContract = contract;
  });

  it("Should return 0 (inconclusive) after un seul coup valide", async function () {
    // e2->e4 (0x08 -> 0x18) en hypothèse
    const moves = [encodeMove(0x08, 0x18)];
    const [outcome] = await deployedContract.checkGameFromStart(moves);
    expect(outcome).to.equal(inconclusive_outcome); // 0
  });

  it("Should return 2 (white wins) when black resigns", async function () {
    // White joue e2->e4, puis Black resign
    const moves = [encodeMove(0x08, 0x18), resign_const];
    const [outcome] = await deployedContract.checkGameFromStart(moves);
    expect(outcome).to.equal(white_win_outcome); // 2
  });

  it("Should return 3 (black wins) when white resigns", async function () {
    // White joue e2->e4, Black joue e7->e5, puis White resign
    const moves = [
      encodeMove(0x08, 0x18),
      encodeMove(0x28, 0x38),
      resign_const,
    ];
    const [outcome] = await deployedContract.checkGameFromStart(moves);
    expect(outcome).to.equal(black_win_outcome); // 3
  });

  it("Should end with White checkmating Black (Scholar's Mate)", async function () {
    // Séquence de mat du berger
    const moves = [
      encodeMove(0x0c, 0x1c), // e2 -> e4
      encodeMove(0x34, 0x24), // e7 -> e5
      encodeMove(0x03, 0x27), // Qd1 -> h5
      encodeMove(0x39, 0x2a), // Nb8 -> c6
      encodeMove(0x05, 0x1a), // Bf1 -> c4
      encodeMove(0x3e, 0x2d), // Ng8 -> f6
      encodeMove(0x27, 0x35), // Qh5 -> f7 (mat)
    ];
    const [outcome] = await deployedContract.checkGameFromStart(moves);
    expect(outcome).to.equal(white_win_outcome); // 2
  });
});

/**
 * 2. Tests utilisant directement checkEndgame (aucun coup, juste un plateau statique)
 *    Ici, on ne passe pas par checkGameFromStart, donc 'moves' = [] n'est plus un problème.
 */
describe("ChessControl - checkEndgame scenarios (no moves)", function () {
  let deployedContract: ChessControl;

  beforeEach(async function () {
    const { deployedContract: contract } = await loadFixture(
      deployChessControlFixture
    );
    deployedContract = contract;
  });

  it("Scenario 1: Returns 0 (inconclusive) if the player can still move", async function () {
    // Roi blanc en case 0 (0x6), roi noir en case 63 (0xe), => noir peut bouger => inconclusive
    let gameState = 0n;
    gameState |= BigInt(0x6) << BigInt(0 * 4); // white king at 0
    gameState |= BigInt(0xe) << BigInt(63 * 4); // black king at 63

    const playerState = 0x3fff; // Noir => roi=63
    const opponentState = 0x00ff; // Blanc => roi=0

    const outcome = await deployedContract.checkEndgame(
      gameState,
      playerState,
      opponentState
    );
    expect(outcome).to.equal(0); // inconclusive
  });

  it("Scenario 2: Returns 1 (stalemate)", async function () {
    // Roi noir en h8 (63), roi blanc en f7 (53), dame blanche en g6 (46)
    let gameState = 0n;
    gameState |= BigInt(0xe) << BigInt(63 * 4); // black king
    gameState |= BigInt(0x6) << BigInt(53 * 4); // white king
    gameState |= BigInt(0x5) << BigInt(46 * 4); // white queen

    const playerState = 0x3fff; // Noir => roi=63
    const opponentState = 0x35ff; // Blanc => roi=53

    const outcome = await deployedContract.checkEndgame(
      gameState,
      playerState,
      opponentState
    );
    expect(outcome).to.equal(1); // stalemate
  });

  it("Should see g8 (62) as attacked in the stalemate scenario by Queen g6", async () => {
    let gs = 0n;
    gs |= BigInt(0xe) << BigInt(63 * 4); // black king h8
    gs |= BigInt(0x6) << BigInt(53 * 4); // white king f7
    gs |= BigInt(0x5) << BigInt(46 * 4); // white queen g6

    const attacked = await deployedContract.pieceUnderAttack(gs, 62);
    expect(attacked).to.equal(true);
  });

  it("Should see h7 (55) as attacked in the stalemate scenario", async () => {
    let gs = 0n;
    gs |= BigInt(0xe) << BigInt(63 * 4);
    gs |= BigInt(0x6) << BigInt(53 * 4);
    gs |= BigInt(0x5) << BigInt(46 * 4);

    const attacked = await deployedContract.pieceUnderAttack(gs, 55);
    expect(attacked).to.equal(true);
  });

  it("Should see g7 (54) as attacked in the stalemate scenario", async () => {
    let gs = 0n;
    gs |= BigInt(0xe) << BigInt(63 * 4);
    gs |= BigInt(0x6) << BigInt(53 * 4);
    gs |= BigInt(0x5) << BigInt(46 * 4);

    const attacked = await deployedContract.pieceUnderAttack(gs, 54);
    expect(attacked).to.equal(true);
  });

  it("checkKingValidMoves: Roi noir en h8 (63) ne doit pas pouvoir bouger (f7+g6 occupés)", async function () {
    let gs = 0n;
    gs |= BigInt(0xe) << BigInt(63 * 4); // black king h8
    gs |= BigInt(0x6) << BigInt(53 * 4); // white king f7
    gs |= BigInt(0x5) << BigInt(46 * 4); // white queen g6

    const blackPlayerState = 0x3fff; // roi=63
    const canMove = await deployedContract.checkKingValidMoves(
      gs,
      63,
      blackPlayerState,
      true
    );
    expect(canMove).to.equal(false);
  });
});
