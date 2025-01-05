const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

describe("ChessTemplate", function () {
  // ===============================
  // =========== CONFIG ============
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
  async function createAndInitializeGame(
    chessFactory: {
      connect: (arg0: any) => {
        (): any;
        new (): any;
        registerUser: { (arg0: string): any; new (): any };
        registerToGame: { (arg0: any): any; new (): any };
      };
      createGame: (arg0: any, arg1: any) => any;
      getGames: (arg0: number, arg1: number) => any;
    },
    addr1: any,
    addr2: any
  ) {
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

  async function getWinner(chessGame: any) {
    return await chessGame.getWinner(); // Assuming a wrapper is created
  }

  // Fonction utilitaire pour encoder un mouvement (from, to) dans un entier
  function encodeMove(from: number, to: number): number {
    // 6 bits pour 'from', 6 bits pour 'to'
    return (from << 6) | to;
  }

  // ===============================
  // ========= MODIFIERS ===========
  // ===============================

  describe("onlyPlayers", function () {
    let chessTemplate: any;
    let owner: any;
    beforeEach(async function () {
      ({ chessTemplate, owner } = await loadFixture(deployContractsFixture));
    });
    it("Should revert if a non-player attempts to call a function restricted by onlyPlayers", async function () {
      // Supposons que 'owner' ne soit pas inscrit comme player1 ou player2
      // On tente de jouer un coup avec 'owner'
      const moves = [796];

      await expect(
        chessTemplate.connect(owner).playMove(moves)
      ).to.be.revertedWithCustomError(chessTemplate, "NotParticipant");
    });
  });

  describe("onlyChessFactory", function () {
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessTemplate, addr1, addr2 } = await loadFixture(
        deployContractsFixture
      ));
    });
    it("Should revert if a non-ChessFactory address tries to call setPlayer1", async function () {
      // On tente d'appeler setPlayer1 depuis addr1, qui n'est pas l'adresse du ChessFactory
      await expect(
        chessTemplate.connect(addr1).setPlayer1(addr2.address)
      ).to.be.revertedWithCustomError(chessTemplate, "OnlyChessFactory");
    });
  });

  // ===============================
  // ======== INITIALIZE ========
  // ===============================

  describe("Initialize", function () {
    let chessFactory: any;
    let chessTemplate: any;
    beforeEach(async function () {
      ({ chessFactory, chessTemplate } = await loadFixture(
        deployContractsFixture
      ));
    });
    it("Should initialize the contract with correct parameters", async function () {
      // Initialize the ChessTemplate contract
      await chessTemplate.initialize(chessFactory.target);

      // Verify initialization
      expect(await chessTemplate.status()).to.equal(0); // GameStatus.Inactive
      expect(await chessTemplate.gameActive()).to.equal(false);
    });
    it("Should revert if _chessFactory is address(0)", async function () {
      // Déploie une nouvelle instance de ChessTemplate sans l'initialiser.
      const newChessTemplate = await hre.ethers.deployContract("ChessTemplate");

      // Tente d'appeler la fonction initialize avec l'adresse 0.
      await expect(
        newChessTemplate.initialize(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(newChessTemplate, "InvalidChessFactory");
    });
  });

  // ===============================
  // ========= SETPLAYERS ==========
  // ===============================

  describe("SET PLAYERS", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;
    let factorySigner: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2, addr3 } = await loadFixture(
        deployContractsFixture
      ));
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
      await hre.network.provider.send("hardhat_setBalance", [
        chessFactory.target, // L'adresse du contrat ChessFactory
        "0x1BC16D674EC80000", // 2 ETH en hex (decimal = 2000000000000000000)
      ]);

      // 2) Impersonnez l'adresse du contrat ChessFactory
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [chessFactory.target],
      });

      // 3) Récupérez un Signer "factice" qui agit comme ChessFactory
      factorySigner = await hre.ethers.getSigner(chessFactory.target);
    });

    it("Should allow only ChessFactory to call setPlayer1", async function () {
      await expect(
        chessTemplate.connect(addr1).setPlayer1(addr3.address)
      ).to.be.revertedWithCustomError(chessTemplate, "OnlyChessFactory");
    });

    it("Should revert with AlreadyInitialized if player1 is already set", async function () {
      await expect(
        chessTemplate.connect(factorySigner).setPlayer1(addr1.address)
      ).to.be.revertedWithCustomError(chessTemplate, "AlreadyInitialized");
    });

    it("Should allow only ChessFactory to call setPlayer2", async function () {
      await expect(
        chessTemplate.connect(addr1).setPlayer2(addr3.address)
      ).to.be.revertedWithCustomError(chessTemplate, "OnlyChessFactory");
    });

    it("Should revert with AlreadyInitialized if player2 is already set", async function () {
      await expect(
        chessTemplate.connect(factorySigner).setPlayer2(addr2.address)
      ).to.be.revertedWithCustomError(chessTemplate, "AlreadyInitialized");
    });
  });

  // ===============================
  // ======== SETGAMEACTIVE ========
  // ===============================

  describe("setGameActive", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    let factorySigner: any;

    let newChessTemplate: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2 } = await loadFixture(
        deployContractsFixture
      ));
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
      await hre.network.provider.send("hardhat_setBalance", [
        chessFactory.target, // L'adresse du contrat ChessFactory
        "0x1BC16D674EC80000", // 2 ETH en hex (decimal = 2000000000000000000)
      ]);

      // 2) Impersonnez l'adresse du contrat ChessFactory
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [chessFactory.target],
      });

      // 3) Récupérez un Signer "factice" qui agit comme ChessFactory
      factorySigner = await hre.ethers.getSigner(chessFactory.target);

      newChessTemplate = await hre.ethers.deployContract("ChessTemplate");
      await newChessTemplate.initialize(chessFactory.target);
    });
    it("Should allow only ChessFactory to call setGameActive", async function () {
      await expect(
        chessTemplate.connect(addr1).setGameActive()
      ).to.be.revertedWithCustomError(chessTemplate, "OnlyChessFactory");
    });
    it("Should revert with PlayersNotRegistered if player1 or player2 is not set", async function () {
      const factorySigner = await hre.ethers.getSigner(chessFactory.target);

      await expect(
        newChessTemplate.connect(factorySigner).setGameActive()
      ).to.be.revertedWithCustomError(newChessTemplate, "PlayersNotRegistered");

      await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [chessFactory.target],
      });
    });
    it("Should revert with GameAlreadyActive if the game is already active", async function () {
      const factorySigner = await hre.ethers.getSigner(chessFactory.target);

      await newChessTemplate.connect(factorySigner).setPlayer1(addr1.address);
      await newChessTemplate.connect(factorySigner).setPlayer2(addr2.address);

      await newChessTemplate.connect(factorySigner).setGameActive();

      await expect(
        newChessTemplate.connect(factorySigner).setGameActive()
      ).to.be.revertedWithCustomError(newChessTemplate, "GameAlreadyActive");

      await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [chessFactory.target],
      });
    });
  });

  // ===============================
  // ========= PLAYMOVE ============
  // ===============================

  describe("playMove", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    let owner: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2, owner } = await loadFixture(
        deployContractsFixture
      ));
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
        .withArgs(addr1.address, moves);

      // Verify the move was recorded
      const gameState = await chessTemplate.getGameState();
      expect(gameState.moves.length).to.equal(1);
      expect(gameState.moves[0]).to.equal(moves[0]);

      expect(await chessTemplate.status()).to.equal(1); // GameStatus.Active
      expect(await chessTemplate.gameActive()).to.equal(true);
    });

    it("Should revert if non-players attempt to play moves", async function () {
      // Attempt to play a move with a non-player (owner)
      const moves = [796];
      await expect(
        chessTemplate.connect(owner).playMove(moves)
      ).to.be.revertedWithCustomError(chessTemplate, "NotParticipant");
    });

    it("Should handle empty moves array gracefully", async function () {
      await expect(
        chessTemplate.connect(addr1).playMove([])
      ).to.be.revertedWithCustomError(chessTemplate, "EmptyMovesArray");
    });

    it("Should revert if a player makes a move while the game is inactive", async function () {
      const moves = [796];
      await chessTemplate.connect(addr1).abandon();

      await expect(
        chessTemplate.connect(addr1).playMove(moves)
      ).to.be.revertedWithCustomError(chessTemplate, "GameNotActive");
    });

    it("Should revert multiple moves in a single transaction", async function () {
      const moves = [796, 798, 802]; // Multiple moves by a player

      await expect(
        chessTemplate.connect(addr1).playMove(moves)
      ).to.be.revertedWith("Invalid move: incorrect piece color");
    });

    it("Should finalize the game when Player1 wins", async function () {
      // Mock the outcome to white_win_outcome (assuming 1)
      const moves = [
        encodeMove(0x0c, 0x1c), // e2 -> e4
        encodeMove(0x34, 0x24), // e7 -> e5
        encodeMove(0x03, 0x27), // Qd1 -> h5
        encodeMove(0x39, 0x2a), // Nb8 -> c6
        encodeMove(0x05, 0x1a), // Bf1 -> c4
        encodeMove(0x3e, 0x2d), // Ng8 -> f6
        encodeMove(0x27, 0x35), // Qh5 -> f7 (mat)
      ];

      await expect(chessTemplate.connect(addr1).playMove(moves))
        .to.emit(chessTemplate, "GameEnded")
        .withArgs(2, addr1.address);

      // Verify game status
      expect(await chessTemplate.status()).to.equal(4); // GameStatus.Ended
      expect(await chessTemplate.gameActive()).to.equal(false);
    });

    it("Should finalize the game when Player2 wins", async function () {
      // Mock the outcome to black_win_outcome (assuming 2)
      const moves = [encodeMove(0x08, 0x18), encodeMove(0x28, 0x38), 0x3000];

      await expect(chessTemplate.connect(addr2).playMove(moves))
        .to.emit(chessTemplate, "GameEnded")
        .withArgs(3, addr2.address);

      // Verify game status
      expect(await chessTemplate.status()).to.equal(4); // GameStatus.Ended
      expect(await chessTemplate.gameActive()).to.equal(false);
    });
  });

  // ===============================
  // ========= ABANDON ============
  // ===============================

  describe("abandon", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2 } = await loadFixture(
        deployContractsFixture
      ));
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
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

    it("Should revert if a player tries to abandon a game that is not active", async function () {
      await chessTemplate.connect(addr1).abandon();

      await expect(
        chessTemplate.connect(addr1).abandon()
      ).to.be.revertedWithCustomError(chessTemplate, "GameNotActive");
    });
  });

  // ===============================
  // ======== PROPOSEDRAW ==========
  // ===============================

  describe("proposeDraw", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2, addr3 } = await loadFixture(
        deployContractsFixture
      ));
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });
    it("Should revert if a non-player attempts to propose a draw", async function () {
      await expect(
        chessTemplate.connect(addr3).proposeDraw()
      ).to.be.revertedWithCustomError(chessTemplate, "NotParticipant");
    });

    it("Should revert if trying to accept a draw without a proposal", async function () {
      chessTemplate.connect(addr1).proposeDraw();
      await expect(
        chessTemplate.connect(addr2).proposeDraw()
      ).to.be.revertedWithCustomError(chessTemplate, "DrawAlreadyProposed");
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

    it("Should revert if a player tries to propose a draw for a game that is not active", async function () {
      await chessTemplate.connect(addr1).abandon();

      await expect(
        chessTemplate.connect(addr1).proposeDraw()
      ).to.be.revertedWithCustomError(chessTemplate, "GameNotActive");
    });
  });

  // ===============================
  // ========= ACCEPTDRAW ==========
  // ===============================

  describe("acceptDraw", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2 } = await loadFixture(
        deployContractsFixture
      ));
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
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

    it("Should revert if a draw is accepted while the game is inactive", async function () {
      await chessTemplate.connect(addr1).abandon();

      await expect(
        chessTemplate.connect(addr1).acceptDraw()
      ).to.be.revertedWithCustomError(chessTemplate, "GameNotActive");
    });
  });

  // ===============================
  // ======= GETGAMESTATE ==========
  // ===============================

  describe("getGameState", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2 } = await loadFixture(
        deployContractsFixture
      ));
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

  // ===============================
  // ========= GETWINNER ===========
  // ===============================

  describe("getWinner", function () {
    let chessFactory: any;
    let chessTemplate: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2 } = await loadFixture(
        deployContractsFixture
      ));
      chessTemplate = await createAndInitializeGame(chessFactory, addr1, addr2);
    });

    it("should return address(0) if none of the conditions match", async function () {
      const { currentStatus, winner } = await chessTemplate.getGameState();
      expect(winner).to.equal(hre.ethers.ZeroAddress);
      expect(currentStatus).to.equal(1);
    });

    it("should return player1 if player2 abandon", async function () {
      await chessTemplate.connect(addr2).abandon();
      const { currentStatus, winner } = await chessTemplate.getGameState();
      expect(winner).to.equal(addr1.address);
      expect(currentStatus).to.equal(3);
    });

    it("should return player2 if player1 abandon", async function () {
      await chessTemplate.connect(addr1).abandon();
      const { currentStatus, winner } = await chessTemplate.getGameState();
      expect(winner).to.equal(addr2.address);
      expect(currentStatus).to.equal(3);
    });
  });
});
