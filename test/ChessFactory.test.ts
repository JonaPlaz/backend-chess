import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ChessFactory, ChessTemplate, ChessToken } from "../typechain-types";

describe("ChessFactory", function () {
  async function deployFactoryFixture() {
    const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

    // Déploiement de ChessTemplate
    const chessTemplate = await hre.ethers.deployContract("ChessTemplate");

    // Déploiement de ChessToken
    const chessToken = await hre.ethers.deployContract("ChessToken", [
      hre.ethers.parseUnits("1000000", 18),
    ]);

    // Déploiement de ChessFactory
    const chessFactory = await hre.ethers.deployContract("ChessFactory", [
      chessTemplate.target,
    ]);

    // Configuration du ChessToken dans le Factory
    await chessFactory.setChessToken(chessToken.target);

    // Approvisionnement en ChessTokens
    await chessToken.approve(
      chessFactory.target,
      hre.ethers.parseUnits("10000", 18)
    );
    await chessFactory.depositTokens(hre.ethers.parseUnits("10000", 18));

    return {
      chessFactory,
      chessTemplate,
      chessToken,
      owner,
      addr1,
      addr2,
      addr3,
    };
  }

  describe("Initialization", function () {
    it("Should set the correct ChessTemplate and ChessToken addresses", async function () {
      const { chessFactory, chessTemplate, chessToken } = await loadFixture(
        deployFactoryFixture
      );

      expect(await chessFactory.templateAddress()).to.equal(
        chessTemplate.target
      );
      expect(await chessFactory.chessTokenAddress()).to.equal(
        chessToken.target
      );
    });

    it("Should revert if trying to set ChessToken to zero address", async function () {
      const { chessFactory } = await loadFixture(deployFactoryFixture);

      await expect(
        chessFactory.setChessToken(hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid ChessToken address");
    });
  });

  describe("Token Management", function () {
    it("Should allow the owner to deposit ChessTokens", async function () {
      const { chessFactory, chessToken } = await loadFixture(
        deployFactoryFixture
      );

      // Récupérer la balance initiale en tant que BigInt
      const initialBalance = await chessFactory.platformBalance();

      // Approuver et déposer des tokens
      const depositAmount = hre.ethers.parseUnits("5000", 18);
      await chessToken.approve(chessFactory.target, depositAmount);
      await chessFactory.depositTokens(depositAmount);

      // Récupérer la nouvelle balance
      const newBalance = await chessFactory.platformBalance();

      // Vérifier que la balance a augmenté du montant déposé
      expect(newBalance).to.equal(initialBalance + depositAmount);
    });

    it("Should revert if non-owner tries to deposit ChessTokens", async function () {
      const { chessFactory, chessToken, addr1 } = await loadFixture(
        deployFactoryFixture
      );

      await chessToken
        .connect(addr1)
        .approve(chessFactory.target, hre.ethers.parseUnits("5000", 18));

      await expect(
        chessFactory
          .connect(addr1)
          .depositTokens(hre.ethers.parseUnits("5000", 18))
      ).to.be.revertedWithCustomError(
        chessFactory,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Game Creation", function () {
    it("Should create a new game and register player", async function () {
      const { chessFactory, chessTemplate, addr1, addr2, owner } =
        await loadFixture(deployFactoryFixture);

      const betAmount = hre.ethers.parseUnits("100", 18);
      const startTime =
        (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

      // Créer un jeu
      await chessFactory.connect(owner).createGame(betAmount, startTime);

      // Vérifier que le jeu a été créé
      const games = await chessFactory.getGames(0, 1);
      expect(games[0].gameAddress).to.not.equal(hre.ethers.ZeroAddress);
      expect(games[0].betAmount).to.equal(betAmount);
      expect(games[0].startTime).to.equal(startTime);

      await chessFactory.connect(addr1).registerUser("Player1");
      // Enregistrer les joueurs
      await chessFactory.connect(addr1).registerToGame(games[0].gameAddress);

      // Vérifier que les joueurs sont correctement enregistrés
      const gameDetails = await chessFactory.getGameDetails(
        games[0].gameAddress
      );
      expect(gameDetails.player1.userAddress).to.equal(addr1.address);
    });

    it("Should revert if betAmount is zero", async function () {
      const { chessFactory } = await loadFixture(deployFactoryFixture);

      const startTime =
        (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

      await expect(chessFactory.createGame(0, startTime)).to.be.revertedWith(
        "Bet amount must be greater than 0"
      );
    });

    it("Should revert if start time is in the past", async function () {
      const { chessFactory } = await loadFixture(deployFactoryFixture);

      const startTime =
        (await hre.ethers.provider.getBlock("latest")).timestamp - 3600;

      await expect(
        chessFactory.createGame(hre.ethers.parseUnits("100", 18), startTime)
      ).to.be.revertedWith("Start time must be in the future");
    });
  });

  describe("User Registration", function () {
    it("Should register a new user", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      // Enregistrer un utilisateur
      await chessFactory.connect(addr1).registerUser("Player1");

      // Appeler getUser avec addr1
      const user = await chessFactory.connect(addr1).getUser();

      // Vérifications
      expect(user.userAddress).to.equal(addr1.address);
      expect(user.pseudo).to.equal("Player1");
      expect(user.balance).to.equal(hre.ethers.parseUnits("1000", 18));
    });

    it("Should revert if user tries to register twice", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      await chessFactory.connect(addr1).registerUser("Player1");

      await expect(
        chessFactory.connect(addr1).registerUser("Player1")
      ).to.be.revertedWith("User already registered");
    });

    it("Should revert if pseudo is empty", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      await expect(
        chessFactory.connect(addr1).registerUser("")
      ).to.be.revertedWith("Pseudo cannot be empty");
    });
  });

  describe("Game Participation", function () {
    it("Should allow users to join a game", async function () {
      const { chessFactory, chessTemplate, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      );

      const betAmount = hre.ethers.parseUnits("100", 18);
      const startTime =
        (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

      await chessFactory.createGame(betAmount, startTime);

      const games = await chessFactory.getGames(0, 1);
      const gameAddress = games[0].gameAddress;

      await chessFactory.connect(addr1).registerUser("Player1");
      await chessFactory.connect(addr2).registerUser("Player2");

      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      const gameDetails = await chessFactory.getGameDetails(gameAddress);

      expect(gameDetails.player1.userAddress).to.equal(addr1.address);
      expect(gameDetails.player2.userAddress).to.equal(addr2.address);
    });

    it("Should revert if non-registered user tries to join a game", async function () {
      const { chessFactory, chessTemplate, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      );

      const betAmount = hre.ethers.parseUnits("100", 18);
      const startTime =
        (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;

      await chessFactory.createGame(betAmount, startTime);

      const games = await chessFactory.getGames(0, 1);
      const gameAddress = games[0].gameAddress;

      await chessFactory.connect(addr1).registerUser("Player1");

      await expect(
        chessFactory.connect(addr2).registerToGame(gameAddress)
      ).to.be.revertedWith("User not registered");
    });
  });
});
