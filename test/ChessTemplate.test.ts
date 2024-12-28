import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ChessFactory, ChessTemplate } from "../typechain-types";

describe("ChessTemplate", function () {
  async function deployChessTemplateFixture() {
    const [owner, addr1, addr2] = await hre.ethers.getSigners();

    const chessTemplate = await hre.ethers.deployContract("ChessTemplate");
    const chessFactory = await hre.ethers.deployContract("ChessFactory", [
      chessTemplate.target,
    ]);
    const chessToken = await hre.ethers.deployContract("ChessToken", [
      hre.ethers.parseUnits("1000000", 18),
    ]);

    await chessFactory.setChessToken(chessToken.target);

    await chessToken.approve(
      chessFactory.target,
      hre.ethers.parseUnits("10000", 18)
    );
    await chessFactory.depositTokens(hre.ethers.parseUnits("10000", 18));

    return { chessTemplate, chessFactory, owner, addr1, addr2, chessToken };
  }

  describe("Initialization", function () {
    it("Should initialize the contract with correct parameters", async function () {
      const { chessTemplate, addr1, addr2, chessFactory } = await loadFixture(
        deployChessTemplateFixture
      );

      // Initialiser le contrat
      await chessTemplate.initialize(
        addr1.address,
        addr2.address,
        chessFactory.target
      );

      expect(await chessTemplate.player1()).to.equal(addr1.address);
      expect(await chessTemplate.player2()).to.equal(addr2.address);
    });

    it("Should revert if initialized more than once", async function () {
      const { chessTemplate, addr1, addr2, chessFactory } = await loadFixture(
        deployChessTemplateFixture
      );

      // Initialiser le contrat
      await chessTemplate.initialize(
        addr1.address,
        addr2.address,
        chessFactory.target
      );

      // Tenter une deuxième initialisation
      await expect(
        chessTemplate.initialize(
          addr1.address,
          addr2.address,
          chessFactory.target
        )
      ).to.be.revertedWithCustomError(chessTemplate, "AlreadyInitialized");
    });
  });

  describe("Gameplay", function () {
    describe("Gameplay", function () {
      it("Should activate the game when called by ChessFactory", async function () {
        const { chessFactory, addr1, addr2 } = await loadFixture(
          deployChessTemplateFixture
        );

        const betAmount = hre.ethers.parseUnits("100", 18);
        const startTime =
          (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

        // Create a game via ChessFactory
        await chessFactory.createGame(betAmount, startTime);

        const games = await chessFactory.getGames(0, 1);
        const gameAddress = games[0].gameAddress;

        // Get the cloned ChessTemplate instance
        const chessTemplate = await hre.ethers.getContractAt(
          "ChessTemplate",
          gameAddress
        );

        // Register users via ChessFactory
        await chessFactory.connect(addr1).registerUser("Player1");
        await chessFactory.connect(addr2).registerUser("Player2");

        // Register players to the game and activate it via ChessFactory
        await chessFactory.connect(addr1).registerToGame(gameAddress);
        await chessFactory.connect(addr2).registerToGame(gameAddress);

        // Validate the players and game status
        expect(await chessTemplate.player1()).to.equal(addr1.address);
        expect(await chessTemplate.player2()).to.equal(addr2.address);
        expect(await chessTemplate.isGameActive()).to.equal(true);
      });
    });

    it("Should allow players to play moves", async function () {
      const { chessFactory, addr1, addr2 } = await loadFixture(
        deployChessTemplateFixture
      );

      const betAmount = hre.ethers.parseUnits("100", 18);
      const startTime =
        (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

      await chessFactory.createGame(betAmount, startTime);

      const games = await chessFactory.getGames(0, 1);
      const gameAddress = games[0].gameAddress;

      // Enregistrer les joueurs dans le contrat Factory
      await chessFactory.connect(addr1).registerUser("Player1");
      await chessFactory.connect(addr2).registerUser("Player2");

      // Ajouter les joueurs au jeu et activer le jeu via le contrat Factory
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      const chessTemplate = await hre.ethers.getContractAt(
        "ChessTemplate",
        gameAddress
      );

      // Vérifiez que les joueurs sont bien enregistrés dans ChessTemplate
      expect(await chessTemplate.player1()).to.equal(addr1.address);
      expect(await chessTemplate.player2()).to.equal(addr2.address);

      const moves = [796];

      await expect(chessTemplate.connect(addr1).playMove(moves))
        .to.emit(chessTemplate, "MovePlayed")
        .withArgs(addr1.address, moves[moves.length - 1]);

      const gameState = await chessTemplate.getGameState();
      expect(gameState.moves.length).to.equal(moves.length);
    });

    it("Should allow a player to abandon the game", async function () {
      const { chessFactory, addr1, addr2 } = await loadFixture(
        deployChessTemplateFixture
      );

      const betAmount = hre.ethers.parseUnits("100", 18);
      const startTime =
        (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

      // Créer un jeu
      await chessFactory.createGame(betAmount, startTime);

      // Récupérer l'adresse du jeu créé
      const games = await chessFactory.getGames(0, 1);
      const gameAddress = games[0].gameAddress;

      // Charger le contrat ChessTemplate lié à gameAddress
      const chessTemplate = await hre.ethers.getContractAt(
        "ChessTemplate",
        gameAddress
      );

      // Enregistrer les joueurs dans le contrat Factory
      await chessFactory.connect(addr1).registerUser("Player1");
      await chessFactory.connect(addr2).registerUser("Player2");

      // Ajouter les joueurs au jeu et activer le jeu via le contrat Factory
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Vérifiez que les joueurs sont enregistrés correctement dans le ChessTemplate
      expect(await chessTemplate.player1()).to.equal(addr1.address);
      expect(await chessTemplate.player2()).to.equal(addr2.address);

      // Abandonner la partie
      await expect(chessTemplate.connect(addr1).abandon())
        .to.emit(chessTemplate, "GameAbandoned")
        .withArgs(addr1.address, addr2.address);

      // Vérifiez que le jeu est inactif
      expect(await chessTemplate.isGameActive()).to.equal(false);
    });

    describe("ChessTemplate Gameplay and Restrictions", function () {
      it("Should revert if non-players attempt to play moves", async function () {
        const { chessFactory, addr1, addr2, owner } = await loadFixture(
          deployChessTemplateFixture
        );

        const betAmount = hre.ethers.parseUnits("100", 18);
        const startTime =
          (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

        // Create a game
        await chessFactory.createGame(betAmount, startTime);

        const games = await chessFactory.getGames(0, 1);
        const gameAddress = games[0].gameAddress;

        // Get the cloned ChessTemplate instance
        const chessTemplate = await hre.ethers.getContractAt(
          "ChessTemplate",
          gameAddress
        );

        await chessFactory.connect(addr1).registerUser("Player1");
        await chessFactory.connect(addr2).registerUser("Player2");

        // Register players and activate the game
        await chessFactory.connect(addr1).registerToGame(gameAddress);
        await chessFactory.connect(addr2).registerToGame(gameAddress);

        const moves = [796];
        await expect(
          chessTemplate.connect(owner).playMove(moves)
        ).to.be.revertedWith("Not a participant");
      });
    });
  });
});
