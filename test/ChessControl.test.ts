const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

import { ChessControl } from "../typechain-types";

// ===============================
// ======== CONFIG ========
// ===============================

// Constantes
const RESIGN_CONST = 0x3000;
const INCONCLUSIVE_OUTCOME = 0x0;
const WHITE_WIN_OUTCOME = 0x2;
const BLACK_WIN_OUTCOME = 0x3;
const INVALID_MOVE_CONSTANT =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

// Fonction utilitaire pour encoder un mouvement (from, to) dans un entier
function encodeMove(from: number, to: number): number {
  // 6 bits pour 'from', 6 bits pour 'to'
  return (from << 6) | to;
}

// Fixture pour déployer le contrat ChessControl
async function deployChessControlFixture() {
  const chessControl = await hre.ethers.deployContract("ChessControl");
  return chessControl;
}

// ===============================
// ===== CHECKGAMEFROMSTART ======
// ===============================

describe("ChessControl", function () {
  describe("ChessControl - checkGameFromStart", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });

    it("Should revert if the 'moves' array is empty in checkGameFromStart", async function () {
      // On appelle checkGameFromStart avec un tableau vide
      await expect(deployedContract.checkGameFromStart([])).to.be.revertedWith(
        "Moves array cannot be empty"
      );
    });

    it("Should return 0 (inconclusive) after un seul coup valide", async function () {
      // White joue e2->e4 (0x08 -> 0x18)
      const moves = [encodeMove(0x08, 0x18)];
      const [outcome] = await deployedContract.checkGameFromStart(moves);
      expect(outcome).to.equal(INCONCLUSIVE_OUTCOME); // 0
    });

    it("Should return 2 (white wins) when black resigns", async function () {
      // White joue e2->e4, puis Black resign
      const moves = [encodeMove(0x08, 0x18), RESIGN_CONST];
      const [outcome] = await deployedContract.checkGameFromStart(moves);
      expect(outcome).to.equal(WHITE_WIN_OUTCOME); // 2
    });

    it("Should return 3 (black wins) when white resigns", async function () {
      // White joue e2->e4, Black joue e7->e5, puis White resign
      const moves = [
        encodeMove(0x08, 0x18),
        encodeMove(0x28, 0x38),
        RESIGN_CONST,
      ];
      const [outcome] = await deployedContract.checkGameFromStart(moves);
      expect(outcome).to.equal(BLACK_WIN_OUTCOME); // 3
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
      expect(outcome).to.equal(WHITE_WIN_OUTCOME); // 2
    });
  });

  // ===============================
  // ========= CHECKGAME ===========
  // ===============================

  describe("ChessControl - checkGame", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should revert with 'Invalid moves array' if moves array is empty", async function () {
      const startingGameState = 0n; // peu importe, on met quelque chose
      const startingPlayerState = 0x00; // idem
      const startingOpponentState = 0x00; // idem
      const startingTurnBlack = false; // idem

      await expect(
        deployedContract.checkGame(
          startingGameState,
          startingPlayerState,
          startingOpponentState,
          startingTurnBlack,
          [] // On envoie un tableau vide
        )
      ).to.be.revertedWith("Invalid moves array");
    });

    it("Should revert with 'Invalid draw sequence' if the last move is accept_draw_const but moves.length < 2", async function () {
      const accept_draw_const = 0x2000; // À ajuster selon votre code
      const startingGameState = 0n;
      const startingPlayerState = 0x00;
      const startingOpponentState = 0x00;
      const startingTurnBlack = false;

      await expect(
        deployedContract.checkGame(
          startingGameState,
          startingPlayerState,
          startingOpponentState,
          startingTurnBlack,
          [accept_draw_const] // un seul coup => length = 1
        )
      ).to.be.revertedWith("Invalid draw sequence");
    });

    it("Should revert with 'Invalid draw request' if the last move is accept_draw_const but the previous move is not request_draw_const", async function () {
      const accept_draw_const = 0x2000; // À ajuster

      const startingGameState = 0n;
      const startingPlayerState = 0x00;
      const startingOpponentState = 0x00;
      const startingTurnBlack = false;

      // On met un "faux" move comme avant-dernier
      const fakeMove = 0x1234; // tout sauf request_draw_const

      await expect(
        deployedContract.checkGame(
          startingGameState,
          startingPlayerState,
          startingOpponentState,
          startingTurnBlack,
          [fakeMove, accept_draw_const]
        )
      ).to.be.revertedWith("Invalid draw request");
    });

    it("Should revert with 'Invalid move: game state' ", async function () {
      let gameState = 0n;

      // a) Placer le roi noir en h8 => pos=63 => 0xE (king_const=0x6 | color_const=0x8)
      gameState = await deployedContract.setPosition(gameState, 63, 0xe);

      // b) Placer une tour blanche en h1 => pos=7 => 0x4 (rook_const=0x4 pour blanc)
      gameState = await deployedContract.setPosition(gameState, 7, 0x4);

      // c) Placer une pièce blanche (ex. fou=0x2) en h7 => pos=55 pour bloquer la colonne
      gameState = await deployedContract.setPosition(gameState, 55, 0x2);

      // d) Ajouter un roi blanc n'importe où (pour éviter les asserts du code),
      //    par ex. e1 => pos=4 => 0x6 (king_const, blanc)
      gameState = await deployedContract.setPosition(gameState, 4, 0x6);

      //   - currentTurnBlack = false => c’est au joueur blanc de jouer.
      //   - On encode la position du roi blanc dans playerState:
      //       king_pos_bit = 8 => (4 << 8) = 0x400
      const startingPlayerState = 0x400;

      //   - On encode la position du roi noir dans opponentState:
      //       (63 << 8) = 0x3f00
      const startingOpponentState = 0x3f00;

      const fromPos = 55;
      const toPos = 54;
      // move = (fromPos << 6) | toPos
      const move = (fromPos << 6) | toPos;
      const moves = [move];

      await expect(
        deployedContract.checkGame(
          gameState,
          startingPlayerState,
          startingOpponentState,
          false, // currentTurnBlack = false => BLANC joue
          moves
        )
      ).to.be.revertedWith("Invalid move: game state");
    });

    it("Should cover startingOpponentState parameter usage", async function () {
      let gameState = 0n;

      // - Placer un pion blanc en pos=0 (juste pour avoir un coup à jouer)
      gameState = await deployedContract.setPosition(gameState, 0, 0x1);

      // - Placer un roi blanc en pos=4 (par ex. e1)
      gameState = await deployedContract.setPosition(gameState, 4, 0x6);

      // - Placer un roi noir en pos=63 (h8)
      gameState = await deployedContract.setPosition(gameState, 63, 0xe);

      //   - currentTurnBlack = false => c'est le joueur blanc qui va jouer en premier.
      //   - Donc, "playerState" correspond au blanc, et "opponentState" correspond au noir.

      // Le white king est en pos=4 => on encode 4 dans le champ "king_pos_bit" du playerState.
      //   Habituellement, king_pos_bit = 8. Donc on fait (4 << 8) = 1024 (0x400).
      const startingPlayerState = 0x400;

      // Le black king est en pos=63 => on encode 63 dans king_pos_bit => (63 << 8) = 16128 (0x3f00).
      const startingOpponentState = 0x3f00;

      const fromPos = 0;
      const toPos = 8;
      const move = (fromPos << 6) | toPos;
      const moves = [move];

      const [outcome, finalGameState] = await deployedContract.checkGame(
        gameState,
        startingPlayerState,
        startingOpponentState,
        /* startingTurnBlack = */ false, // => blanc joue en premier
        moves
      );

      // 5) Vérifier qu’on ne se fait pas rejeter et que l’outcome est 0 (inconclusive)
      expect(outcome).to.equal(0, "No checkmate or draw => outcome=0 expected");

      // 6) Vérifier que le pion a bien bougé de la case 0 à la case 8
      const pieceAt0 = await deployedContract.pieceAtPosition(
        finalGameState,
        0
      );
      const pieceAt8 = await deployedContract.pieceAtPosition(
        finalGameState,
        8
      );
      expect(pieceAt0).to.equal(0, "case 0 should be empty after the move");
      expect(pieceAt8).to.equal(0x1, "case 8 should have the white pawn");
    });
  });

  // ===============================
  // ===== VERIFYEXECUTIVEMOVE =====
  // ===============================

  describe("ChessControl - verifyExecuteMove", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should revert if fromPos == toPos (stale position)", async function () {
      // gameState minimaliste:
      // pion blanc à la case 0 (pos=0).
      let gameState = 0n;
      //  0x1 = pawn_const (pion blanc => 0x1)
      //  => setPosition(gameState, 0, 0x1);
      gameState = await deployedContract.setPosition(gameState, 0, 0x1);

      // On va construire un move:
      const fromPos = 0;
      const toPos = 0;
      const move = (fromPos << 6) | toPos;

      // On appelle verifyExecuteMove
      await expect(
        deployedContract.verifyExecuteMove(
          gameState,
          move,
          0 /* playerState */,
          0 /* opponentState */,
          false /* currentTurnBlack */
        )
      ).to.be.revertedWith("Invalid move: stale position");
    });

    it("Should revert if we move a piece of the wrong color", async function () {
      // On place dans gameState une pièce noire à la case 0, ex. un pion noir => (pawn_const | color_const) = 0x9
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 0, 0x9);

      // On construit un move (fromPos=0, toPos=1) => on veut bouger cette pièce
      const fromPos = 0;
      const toPos = 1;
      const move = (fromPos << 6) | toPos;

      // currentTurnBlack = false => c'est aux blancs de jouer
      // => on essaye de bouger un pion noir => revert
      await expect(
        deployedContract.verifyExecuteMove(
          gameState,
          move,
          0 /* playerState */,
          0 /* opponentState */,
          false /* currentTurnBlack */
        )
      ).to.be.revertedWith("Invalid move: incorrect piece color");
    });

    it("Should revert with UnsupportedPieceType if piece type is not recognized", async function () {
      // Mettons 0x7 => ce n'est pas Pawn(1), Bishop(2), Knight(3), Rook(4), Queen(5), King(6)
      // => ça devrait déclencher revert UnsupportedPieceType.
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 10, 0x7); // ex. case 10

      // On veut bouger depuis la case 10 vers 18
      const fromPos = 10;
      const toPos = 18;
      const move = (fromPos << 6) | toPos;

      // currentTurnBlack = false => peu importe, le test vise le type de pièce
      await expect(
        deployedContract.verifyExecuteMove(
          gameState,
          move,
          0 /* playerState */,
          0 /* opponentState */,
          false /* currentTurnBlack */
        )
      )
        .to.be.revertedWithCustomError(deployedContract, "UnsupportedPieceType")
        .withArgs(0x7, "Invalid move");
      // "withArgs" si on veut vérifier le fromType et le message
    });

    it("Should revert with 'Invalid move: game state' if the newGameState equals invalid_move_constant", async function () {
      // Mettons un Roi blanc en case 0 => 0x6
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 0, 0x6);

      // fromPos=0 vers toPos=10 => move impossible pour un roi
      const fromPos = 0;
      const toPos = 10;
      const move = (fromPos << 6) | toPos;

      // currentTurnBlack = false => c'est bien un roi blanc
      await expect(
        deployedContract.verifyExecuteMove(
          gameState,
          move,
          0, // playerState
          0, // opponentState
          false
        )
      ).to.be.revertedWith("Invalid move: game state");
    });
  });

  // ===============================
  // === VERIFYEXECUTIVEPAWNMOVE ===
  // ===============================

  describe("ChessControl - verifyExecutePawnMove", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should return invalid_move_constant if a white pawn moves in the wrong direction", async function () {
      // Plaçons un pion blanc en case 8 (2e rangée : la rangée 1 en 0-based = row=1 => pos=8..15).
      // fromPos=8 (soit la case a2 si on veut).
      let gameState = 0n;
      // 0x1 => pawn blanc
      gameState = await deployedContract.setPosition(gameState, 8, 0x1);

      // On tente fromPos=8 vers toPos=0 => mouvement "vers le haut" (mauvaise direction pour un pion blanc).
      const fromPos = 8;
      const toPos = 0;
      const moveExtra = 0; // promotion inapplicable ici
      const currentTurnBlack = false; // c'est blanc qui joue

      // Appel direct à verifyExecutePawnMove
      const [newGameState, newPlayerState] =
        await deployedContract.verifyExecutePawnMove(
          gameState,
          fromPos,
          toPos,
          moveExtra,
          currentTurnBlack,
          0, // playerState
          0 // opponentState
        );

      // newGameState devrait valoir invalid_move_constant
      const invalidConstant = INVALID_MOVE_CONSTANT;
      expect(newGameState).to.equal(invalidConstant);
      expect(newPlayerState).to.equal(0);
    });

    it("Should revert with 'Invalid promotion' if promotion piece is invalid", async function () {
      // 1) Placer un pion blanc en case 55 (h7)
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 55, 0x1); // 0x1 = pion blanc

      // 2) fromPos=55 -> toPos=63 (h8), diff=8 => c’est un mouvement légal
      //    mais comme le pion arrive en 1ère rangée de l’adversaire,
      //    il y a promotion => require sur moveExtra
      const fromPos = 55;
      const toPos = 63;

      // 3) moveExtra = 0x7 => invalide
      const invalidPromotionPiece = 7;

      // 4) On s’attend à "Invalid promotion"
      await expect(
        deployedContract.verifyExecutePawnMove(
          gameState,
          fromPos,
          toPos,
          invalidPromotionPiece, // moveExtra
          false, // currentTurnBlack=false => blanc
          0, // playerState
          0 // opponentState
        )
      ).to.be.revertedWith("Invalid promotion");
    });

    it("Should allow a valid double-step forward from the starting rank", async function () {
      // 1) Placer un pion blanc en case 8 (a2)
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 8, 0x1); // 0x1 => pion blanc

      // 2) fromPos=8 -> toPos=24 => diff=16 => double step
      //    On vérifie qu'il n'y a pas de pièce intermédiaire pos=16
      //    ni de pièce en pos=24, etc.
      const fromPos = 8;
      const toPos = 24;

      // 3) On exécute
      const [newGameState, newPlayerState] =
        await deployedContract.verifyExecutePawnMove(
          gameState,
          fromPos,
          toPos,
          0, // moveExtra (pas de promotion)
          false, // currentTurnBlack = false => blanc
          0, // playerState
          0 // opponentState
        );

      // 5) On peut aussi checker que la pièce a bien bougé :
      //    - La case 8 doit être vide
      //    - La case 24 doit contenir le pion blanc
      const pieceAt8 = await deployedContract.pieceAtPosition(newGameState, 8);
      const pieceAt24 = await deployedContract.pieceAtPosition(
        newGameState,
        24
      );
      expect(pieceAt8).to.equal(0); // vide
      expect(pieceAt24).to.equal(0x1); // toujours pion blanc

      // 6) Vérifier que l’en passant est mis à jour dans newPlayerState
      //    On s’attend à ce que newPlayerState & 0xFF == 16
      //    (c’est la case intermédiaire si toPos=24).
      const enPassantPos = Number(newPlayerState) & 0xff;
      expect(enPassantPos).to.equal(16);
    });
  });

  // ===============================
  // ===== CHECKKINGVALIDMOVES =====
  // ===============================

  describe("ChessControl - checkKingValidMoves", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
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

  // ===============================
  // ======== CHECKENDGAME =========
  // ===============================

  describe("ChessControl - checkEndgame", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
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
  });

  // ===============================
  // ====== GETINBETWEENMASK =======
  // ===============================

  describe("ChessControl - getInBetweenMask", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should revert with 'Invalid move' if the movement is neither diagonal, vertical, nor horizontal", async function () {
      const fromPos = 0;
      const toPos = 10;

      await expect(
        deployedContract.getInBetweenMask(fromPos, toPos)
      ).to.be.revertedWith("Invalid move");
    });
  });

  // ===============================
  // ====== PIECEUNDERATTACK =======
  // ===============================

  describe("ChessControl - pieceUnderAttack", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
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
  });

  // ===============================
  // ======= ISKINGADJACENT ========
  // ===============================

  describe("ChessControl - isKingAdjacent", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should return true if there is an enemy king adjacent to the black piece (isKingAdjacent)", async function () {
      let gameState = 0n;

      // - Placer un pion noir (0x9) en case 0 (a1)
      //   0x9 = pawn_const (0x1) | color_const (0x8) = pion noir
      gameState = await deployedContract.setPosition(gameState, 0, 0x9);

      // - Placer un roi blanc (0x6) en case 1 (b1)
      //   0x6 = king_const (blanc)
      gameState = await deployedContract.setPosition(gameState, 1, 0x6);

      //    À l’intérieur, la fonction va détecter qu’un roi blanc est adjacent
      //    => isKingAdjacent(...) => return true
      const attacked = await deployedContract.pieceUnderAttack(gameState, 0);

      expect(attacked).to.equal(
        true,
        "Le pion noir en pos=0 est attaqué par le roi blanc adjacent en pos=1"
      );
    });
  });

  // ===============================
  // ==== CHECKDIRECTIONATTACK =====
  // ===============================

  describe("ChessControl - checkDirectionAttack", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should return true if there is an enemy rook in the same row (checkDirectionalAttack)", async function () {
      // 1) Construire un gameState minimal
      let gameState = 0n;

      // - Pion noir (0x9) en case 0 (a1)
      //   => 0x9 = pawn_const(0x1) | color_const(0x8) = pion noir
      gameState = await deployedContract.setPosition(gameState, 0, 0x9);

      // - Tour blanche (0x4) en case 7 (h1)
      //   => 0x4 = rook_const (blanc),
      //   (si vous encodez la couleur blanche comme 0x0 dans votre code)
      gameState = await deployedContract.setPosition(gameState, 7, 0x4);

      // 2) pieceUnderAttack va invoquer checkDirectionalAttack
      const attacked = await deployedContract.pieceUnderAttack(gameState, 0);

      // 3) On s’attend à ce que ce soit true,
      //    car la Tour blanche est dans la même rangée, aucun obstacle
      expect(attacked).to.equal(
        true,
        "La pièce noire en pos=0 doit être attaquée par la tour blanche en pos=7"
      );
    });

    it("Should return false if no enemy rook/queen/king is found in any direction", async function () {
      // 1) Construire un gameState minimal
      let gameState = 0n;

      // - Pion noir (0x9) en case 0
      gameState = await deployedContract.setPosition(gameState, 0, 0x9);

      // - (Optionnel) Mettre un autre pion noir sur la même rangée en case 7
      //   pour montrer que ce n’est pas un 'enemyRook' => c’est la même couleur.
      gameState = await deployedContract.setPosition(gameState, 7, 0x9);

      // 2) Appel de pieceUnderAttack
      //    checkDirectionalAttack ne trouvera pas de pièce ennemie dans les directions
      //    => devrait être false
      const attacked = await deployedContract.pieceUnderAttack(gameState, 0);

      // 3) On s’attend à false
      expect(attacked).to.equal(
        false,
        "Aucune pièce ennemie dans les directions => false"
      );
    });
  });

  // ===============================
  // ===== CHECKDIAGONALATTACK =====
  // ===============================

  describe("ChessControl - checkDiagonalAttack", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should return true if there is an enemy bishop on the diagonal (checkDiagonalAttack)", async function () {
      // 1) Construire un gameState minimal
      let gameState = 0n;

      // Pion noir (0x9) en pos=0 (a1)
      //   => 0x9 = pawn_const(0x1) | color_const(0x8)
      gameState = await deployedContract.setPosition(gameState, 0, 0x9);

      // Fou blanc (0x2) en pos=9 (b2)
      //   => 0x2 = bishop_const (blanc)
      gameState = await deployedContract.setPosition(gameState, 9, 0x2);

      // 2) Appel pieceUnderAttack
      const attacked = await deployedContract.pieceUnderAttack(gameState, 0);

      // 3) On s’attend à true
      expect(attacked).to.equal(
        true,
        "La pièce noire en pos=0 est attaquée par le fou blanc en pos=9 sur la diagonale."
      );
    });
    it("Should return false if no enemy bishop/queen/king-pawn (on first square) is found on diagonals", async function () {
      // 1) Construire un gameState minimal
      let gameState = 0n;

      // Pion noir (0x9) en pos=0 (a1)
      gameState = await deployedContract.setPosition(gameState, 0, 0x9);

      // Mettre, par exemple, une tour blanche (0x4) sur la diagonale pos=9 (b2)
      // => Ceci n’est pas un fou, ni dame, ni roi/pion en première case => ne déclenche pas "return true"
      gameState = await deployedContract.setPosition(gameState, 9, 0x4);

      // 2) Appel pieceUnderAttack
      const attacked = await deployedContract.pieceUnderAttack(gameState, 0);

      // 3) On s’attend à false
      expect(attacked).to.equal(
        false,
        "Aucune pièce diagonale éligible (fou/dame ou roi/pion en firstSq) => false"
      );
    });
  });

  // ===============================
  // ========= COMMITMOVE ==========
  // ===============================

  describe("ChessControl - commitMove", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should move a piece from 'fromPos' to 'toPos' and leave the 'fromPos' empty", async function () {
      // 1) On place un pion blanc (0x1) en pos=0
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 0, 0x1);

      // 2) On appelle commitMove pour le déplacer vers pos=10
      const fromPos = 0;
      const toPos = 10;
      const newGameState = await deployedContract.commitMove(
        gameState,
        fromPos,
        toPos
      );

      // 3) Vérifier que la case 0 est vide
      const pieceAt0 = await deployedContract.pieceAtPosition(newGameState, 0);
      expect(pieceAt0).to.equal(0, "Case d'origine devrait être vide");

      // 4) Vérifier que la case 10 contient la pièce
      const pieceAt10 = await deployedContract.pieceAtPosition(
        newGameState,
        10
      );
      expect(pieceAt10).to.equal(
        0x1,
        "Case de destination devrait contenir le pion blanc"
      );
    });

    it("Should do nothing if the 'fromPos' is empty", async function () {
      // 1) On place une pièce en case 5, pour voir si ça reste intact
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 5, 0x4); // 0x4 = rook_const (tour blanche)

      // 2) On appelle commitMove depuis une case vide, par exemple pos=10 vers pos=20
      const fromPos = 10;
      const toPos = 20;
      const newGameState = await deployedContract.commitMove(
        gameState,
        fromPos,
        toPos
      );

      // 3) Le gameState ne doit pas changer : la case 5 doit toujours être occupée par la tour (0x4)
      const pieceAt5 = await deployedContract.pieceAtPosition(newGameState, 5);
      expect(pieceAt5).to.equal(0x4, "La tour doit toujours être à la case 5");

      // Vérifier que la case 10 et la case 20 sont vides
      const pieceAt10 = await deployedContract.pieceAtPosition(
        newGameState,
        10
      );
      expect(pieceAt10).to.equal(0, "Case 10 doit rester vide");

      const pieceAt20 = await deployedContract.pieceAtPosition(
        newGameState,
        20
      );
      expect(pieceAt20).to.equal(0, "Case 20 doit rester vide");
    });

    it("Should overwrite the piece at 'toPos' if it's already occupied", async function () {
      // 1) On place une pièce blanche (0x1) en case 0 et une pièce noire (0x9) en case 10
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 0, 0x1); // pion blanc
      gameState = await deployedContract.setPosition(gameState, 10, 0x9); // pion noir

      // 2) On appelle commitMove pour déplacer la pièce blanche sur la case 10
      const fromPos = 0;
      const toPos = 10;
      const newGameState = await deployedContract.commitMove(
        gameState,
        fromPos,
        toPos
      );

      // 3) La case 0 doit être vide
      const pieceAt0 = await deployedContract.pieceAtPosition(newGameState, 0);
      expect(pieceAt0).to.equal(0);

      // 4) La case 10 doit contenir la pièce blanche (0x1), écrasant la pièce noire.
      const pieceAt10 = await deployedContract.pieceAtPosition(
        newGameState,
        10
      );
      expect(pieceAt10).to.equal(0x1);
    });
  });

  // ===============================
  // ========= ZEROPOSITION ==========
  // ===============================

  describe("ChessControl - zeroPosition", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should remove the piece at the given position", async function () {
      // 1) On place une Tour blanche (0x4) en position 10
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 10, 0x4);

      // 2) On appelle zeroPosition(gameState, 10)
      const newGameState = await deployedContract.zeroPosition(gameState, 10);

      // 3) Vérifier que la case 10 est maintenant vide
      const pieceAt10 = await deployedContract.pieceAtPosition(
        newGameState,
        10
      );
      expect(pieceAt10).to.equal(
        0,
        "La case 10 devrait être vide après zeroPosition"
      );
    });

    it("Should not change the gameState if the position is already empty", async function () {
      // 1) On place une pièce quelque part (ex. pos=0) pour vérifier qu'elle reste intacte
      let gameState = 0n;
      gameState = await deployedContract.setPosition(gameState, 0, 0x1); // pion blanc en 0

      // 2) On appelle zeroPosition sur une autre case vide, ex. pos=10
      const newGameState = await deployedContract.zeroPosition(gameState, 10);

      // 3) Vérifier que la case 0 est toujours occupée (0x1)
      const pieceAt0 = await deployedContract.pieceAtPosition(newGameState, 0);
      expect(pieceAt0).to.equal(
        0x1,
        "La pièce en case 0 ne doit pas être affectée"
      );

      // 4) Vérifier que la case 10 est restée vide
      const pieceAt10 = await deployedContract.pieceAtPosition(
        newGameState,
        10
      );
      expect(pieceAt10).to.equal(0);
    });
  });

  // ===============================
  // ========= SETPOSITION =========
  // ===============================

  describe("ChessControl - setPosition", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should revert if pos >= 64 (Invalid position)", async function () {
      // On choisit un pos = 64, ce qui est hors limites
      const invalidPos = 64;

      // On appelle setPosition avec ce pos, et on s’attend à un revert
      await expect(
        deployedContract.setPosition(
          0, // gameState
          invalidPos,
          0x1 // piece (pion blanc, par exemple)
        )
      ).to.be.revertedWith("Invalid position: exceeds board limits");
    });
  });

  // ===============================
  // ======= PIECEATPOSITION =======
  // ===============================

  describe("ChessControl - pieceAtPosition", function () {
    let deployedContract: ChessControl;

    beforeEach(async function () {
      deployedContract = await loadFixture(deployChessControlFixture);
    });
    it("Should revert if pos >= 64 (Invalid position)", async function () {
      // On choisit un pos = 64, ce qui est hors limites
      const invalidPos = 64;

      // On appelle pieceAtPosition avec pos=64, et on s’attend à un revert
      await expect(
        deployedContract.pieceAtPosition(0, invalidPos) // 0 = gameState
      ).to.be.revertedWith("Invalid position: exceeds board limits");
    });
  });
});
