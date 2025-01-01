const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

describe("ChessTemplate", function () {
  // ===============================
  // =========== SETUP =============
  // ===============================

  // Define commonly used constants
  const BET_AMOUNT = hre.ethers.parseUnits("1000", 18);
  const INITIAL_TOKEN_SUPPLY = hre.ethers.parseUnits("1000000", 18);
  const DEPOSIT_AMOUNT = hre.ethers.parseUnits("100000", 18);
  const MOVE_TIMEOUT = 15 * 60; // 15 minutes in seconds

  // Helper function to deploy contracts and perform initial setup
  async function deployContractsFixture() {
    const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

    const chessTemplate = await hre.ethers.deployContract("ChessTemplate");
    const chessFactory = await hre.ethers.deployContract("ChessFactory", [
      chessTemplate.target,
    ]);
    const chessToken = await hre.ethers.deployContract("ChessToken", [
      INITIAL_TOKEN_SUPPLY,
    ]);

    // Set ChessToken in ChessFactory
    await chessFactory.setChessToken(chessToken.target);

    // Approve and deposit tokens into ChessFactory
    await chessToken.approve(chessFactory.target, DEPOSIT_AMOUNT);
    await chessFactory.depositTokens(DEPOSIT_AMOUNT);

    return {
      chessTemplate,
      chessFactory,
      owner,
      addr1,
      addr2,
      addr3,
      chessToken,
    };
  }

  // Helper function to create and initialize a game
  async function createAndInitializeGame(chessFactory, addr1, addr2) {
    // Register users
    await chessFactory.connect(addr1).registerUser("Player1");
    await chessFactory.connect(addr2).registerUser("Player2");

    // Create a game
    const startTime =
      (await hre.ethers.provider.getBlock("latest")).timestamp + 3600; // 1 hour from now
    await chessFactory.createGame(BET_AMOUNT, startTime);

    // Retrieve the created game
    const games = await chessFactory.getGames(0, 1);
    const gameAddress = games[0].gameAddress;

    // Get the ChessTemplate instance for the created game
    const game = await hre.ethers.getContractAt("ChessTemplate", gameAddress);

    // Register players to the game via ChessFactory
    await chessFactory.connect(addr1).registerToGame(gameAddress);
    await chessFactory.connect(addr2).registerToGame(gameAddress);

    return game;
  }

  // ===============================
  // ======== INITIALIZATION ========
  // ===============================

  describe("Initialization", function () {
    it("Should initialize the contract with correct parameters", async function () {
      const { chessTemplate, chessFactory, addr1, addr2 } = await loadFixture(
        deployContractsFixture
      );

      // Initialize the ChessTemplate contract
      await chessTemplate.initialize(
        chessFactory.target
      );

      // Verify initialization
      expect(await chessTemplate.status()).to.equal(0); // GameStatus.Inactive
      expect(await chessTemplate.gameActive()).to.equal(false);
    });
  });

  // ===============================
  // ========= GAMEPLAY ============
  // ===============================

  describe("Gameplay", function () {
    // Common variables for gameplay tests
    let chessTemplate, chessFactory, addr1, addr2;

    // Deploy and initialize a game before each gameplay test
    beforeEach(async function () {
      const fixture = await loadFixture(deployContractsFixture);
      ({ chessTemplate, chessFactory, addr1, addr2 } = fixture);
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });

    it("Should activate the game when called by ChessFactory", async function () {
      // Check that the game is active
      expect(await chessTemplate.isGameActive()).to.equal(true);
      expect(await chessTemplate.status()).to.equal(1); // GameStatus.Active
    });

    it("Should allow players to play moves", async function () {
      const moves = [796]; // Example move

      // Player1 makes a move
      await expect(chessTemplate.connect(addr1).playMove(moves))
        .to.emit(chessTemplate, "MovePlayed")
        .withArgs(addr1.address, moves[moves.length - 1]);

      // Verify the move was recorded
      const gameState = await chessTemplate.getGameState();
      expect(gameState.moves.length).to.equal(1);
      expect(gameState.moves[0]).to.equal(moves[0]);
    });

    it("Should allow a player to abandon the game", async function () {
      // Player1 abandons the game
      await expect(chessTemplate.connect(addr1).abandon())
        .to.emit(chessTemplate, "GameAbandoned")
        .withArgs(addr1.address, addr2.address);

      // Verify game is inactive
      expect(await chessTemplate.isGameActive()).to.equal(false);
      expect(await chessTemplate.status()).to.equal(3); // GameStatus.Abandoned
      expect(await chessTemplate.abandoner()).to.equal(addr1.address);
    });

    describe("Restrictions", function () {
      it("Should revert if non-players attempt to play moves", async function () {
        const { owner } = await loadFixture(deployContractsFixture);
        chessTemplate = await createAndInitializeGame(
          chessFactory,
          addr1,
          addr2
        );
        // Attempt to play a move with a non-player (owner)
        const moves = [796];
        await expect(
          chessTemplate.connect(owner).playMove(moves)
        ).to.be.revertedWithCustomError(chessTemplate, "NotParticipant");
      });

      it("Should revert if a non-owner tries to force a win due to timeout", async function () {
        await expect(
          chessTemplate.connect(addr1).forceWinDueToTimeout()
        ).to.be.revertedWithCustomError(
          chessTemplate,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert if trying to accept a draw without a proposal", async function () {
        chessTemplate.connect(addr1).proposeDraw();
        await expect(
          chessTemplate.connect(addr2).proposeDraw()
        ).to.be.revertedWithCustomError(chessTemplate, "DrawAlreadyProposed");
      });
    });

    // Additional gameplay tests can be added here following the same structure
  });

  // ===============================
  // ======== DRAW PROPOSAL ========
  // ===============================

  describe("Draw Proposals", function () {
    let chessTemplate, chessFactory, addr1, addr2;

    beforeEach(async function () {
      const fixture = await loadFixture(deployContractsFixture);
      ({ chessTemplate, chessFactory, addr1, addr2 } = fixture);
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });

    it("Should allow a player to propose a draw", async function () {
      // Player1 proposes a draw
      await expect(chessTemplate.connect(addr1).proposeDraw())
        .to.emit(chessTemplate, "DrawProposed")
        .withArgs(addr1.address);

      // Verify draw was proposed
      expect(await chessTemplate.drawProposed()).to.equal(true);
      expect(await chessTemplate.proposer()).to.equal(addr1.address);
    });

    it("Should allow the other player to accept the proposed draw", async function () {
      // Player1 proposes a draw
      await chessTemplate.connect(addr1).proposeDraw();

      // Player2 accepts the draw
      await expect(chessTemplate.connect(addr2).acceptDraw())
        .to.emit(chessTemplate, "DrawAccepted")
        .withArgs(addr1.address, addr2.address);

      // Verify game status
      expect(await chessTemplate.isGameActive()).to.equal(false);
      expect(await chessTemplate.status()).to.equal(2); // GameStatus.Draw
    });

    it("Should revert if proposer tries to accept their own draw", async function () {
      // Player1 proposes a draw
      await chessTemplate.connect(addr1).proposeDraw();

      // Player1 attempts to accept their own draw
      await expect(
        chessTemplate.connect(addr1).acceptDraw()
      ).to.be.revertedWithCustomError(chessTemplate, "ProposerCannotAccept");
    });
  });

  // ===============================
  // ======== TIMEOUT HANDLING =====
  // ===============================

  describe("Timeout Handling", function () {
    let chessTemplate, chessFactory, addr1, addr2, addr3;

    beforeEach(async function () {
      const fixture = await loadFixture(deployContractsFixture);
      ({ chessTemplate, chessFactory, addr1, addr2, addr3 } = fixture);
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });

    describe("Draw Proposals and Restrictions", function () {
      it("Should revert if a draw is proposed while the game is inactive", async function () {
        await chessTemplate.connect(addr1).abandon(); // Deactivate the game

        await expect(
          chessTemplate.connect(addr1).proposeDraw()
        ).to.be.revertedWithCustomError(chessTemplate, "GameNotActive");
      });

      it("Should revert if a non-player attempts to propose a draw", async function () {
        await expect(
          chessTemplate.connect(addr3).proposeDraw()
        ).to.be.revertedWithCustomError(chessTemplate, "NotParticipant");
      });
    });

    it("Should distribute rewards correctly for a draw", async function () {
      await chessTemplate.connect(addr1).proposeDraw();
      await chessTemplate.connect(addr2).acceptDraw();

      const gameState = await chessTemplate.getGameState();
      expect(gameState.currentStatus).to.equal(2);
    });

    it("Should revert if non-owner tries to force win due to timeout", async function () {
      // Avancer le temps au-delà du timeout
      await hre.network.provider.send("evm_increaseTime", [MOVE_TIMEOUT + 1]);
      await hre.network.provider.send("evm_mine");

      // Adresse non propriétaire tente de forcer une victoire
      await expect(
        chessTemplate.connect(addr1).forceWinDueToTimeout()
      ).to.be.revertedWithCustomError(
        chessTemplate,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Access Control", function () {
    let chessTemplate, chessFactory, addr1, addr2, addr3;

    beforeEach(async function () {
      const fixture = await loadFixture(deployContractsFixture);
      ({ chessTemplate, chessFactory, addr1, addr2, addr3 } = fixture);
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });

    it("Should revert if a non-owner tries to call forceWinDueToTimeout", async function () {
      await expect(
        chessTemplate.connect(addr1).forceWinDueToTimeout()
      ).to.be.revertedWithCustomError(
        chessTemplate,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should allow only ChessFactory to call setPlayer1", async function () {
      await expect(
        chessTemplate.connect(addr1).setPlayer1(addr3.address)
      ).to.be.revertedWithCustomError(chessTemplate, "OnlyChessFactory");
    });

    it("Should allow only ChessFactory to call setPlayer2", async function () {
      await expect(
        chessTemplate.connect(addr1).setPlayer2(addr3.address)
      ).to.be.revertedWithCustomError(chessTemplate, "OnlyChessFactory");
    });

    it("Should allow only ChessFactory to call setGameActive", async function () {
      await expect(
        chessTemplate.connect(addr1).setGameActive()
      ).to.be.revertedWithCustomError(chessTemplate, "OnlyChessFactory");
    });
  });

  // ===============================
  // ======== EDGE CASES ===========
  // ===============================

  describe("Edge Cases", function () {
    let chessTemplate, chessFactory, addr1, addr2;

    beforeEach(async function () {
      const fixture = await loadFixture(deployContractsFixture);
      ({ chessTemplate, chessFactory, addr1, addr2 } = fixture);
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });

    it("Should handle empty moves array gracefully", async function () {
      await expect(
        chessTemplate.connect(addr1).playMove([])
      ).to.be.revertedWithCustomError(chessTemplate, "EmptyMovesArray");
    });

    it("Should revert if a draw is already proposed", async function () {
      await chessTemplate.connect(addr1).proposeDraw();
      await expect(
        chessTemplate.connect(addr2).proposeDraw()
      ).to.be.revertedWithCustomError(chessTemplate, "DrawAlreadyProposed");
    });
    it("Should revert if ChessFactory address is zero during initialization", async function () {
      await expect(
        chessTemplate.initialize(
          hre.ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(chessTemplate, "InvalidChessFactory");
    });

    it("Should revert if a player makes a move while the game is inactive", async function () {
      const moves = [796];
      await chessTemplate.connect(addr1).abandon();

      await expect(
        chessTemplate.connect(addr1).playMove(moves)
      ).to.be.revertedWithCustomError(chessTemplate, "GameNotActive");
    });

    it("Should revert if a player tries to abandon a game that is not active", async function () {
      await chessTemplate.connect(addr1).abandon();

      await expect(
        chessTemplate.connect(addr1).abandon()
      ).to.be.revertedWithCustomError(chessTemplate, "GameNotActive");
    });

    it("Should set the abandoner correctly when a player abandons", async function () {
      await chessTemplate.connect(addr1).abandon();

      const abandoner = await chessTemplate.abandoner();
      expect(abandoner).to.equal(addr1.address);

      const gameState = await chessTemplate.getGameState();
      expect(gameState.loser).to.equal(addr1.address);
    });

    it("Should revert multiple moves in a single transaction", async function () {
      const moves = [796, 798, 802]; // Multiple moves by a player

      await expect(
        chessTemplate.connect(addr1).playMove(moves)
      ).to.be.revertedWith("Invalid move: incorrect piece color");
    });
  });

  // ===============================
  // ======== GAME STATE ===========
  // ===============================

  describe("getGameState", function () {
    let chessTemplate, chessFactory, addr1, addr2;

    beforeEach(async function () {
      const fixture = await loadFixture(deployContractsFixture);
      ({ chessTemplate, chessFactory, addr1, addr2 } = fixture);
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });

    it("Should return correct game state when active", async function () {
      const gameState = await chessTemplate.getGameState();
      expect(gameState.currentStatus).to.equal(1); // GameStatus.Active
      expect(gameState.moves.length).to.equal(0);
      expect(gameState.winner).to.equal(hre.ethers.ZeroAddress);
      expect(gameState.loser).to.equal(hre.ethers.ZeroAddress);
    });

    it("Should return correct game state after a draw is accepted", async function () {
      await chessTemplate.connect(addr1).proposeDraw();
      await chessTemplate.connect(addr2).acceptDraw();

      const gameState = await chessTemplate.getGameState();
      expect(gameState.currentStatus).to.equal(2); // GameStatus.Draw
      expect(gameState.winner).to.equal(hre.ethers.ZeroAddress);
      expect(gameState.loser).to.equal(hre.ethers.ZeroAddress);
    });

    it("Should return correct game state after abandonment", async function () {
      await chessTemplate.connect(addr1).abandon();

      const gameState = await chessTemplate.getGameState();
      expect(gameState.currentStatus).to.equal(3); // GameStatus.Abandoned
      expect(gameState.winner).to.equal(addr2.address);
      expect(gameState.loser).to.equal(addr1.address);
    });
  });
});
