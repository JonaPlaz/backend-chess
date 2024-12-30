const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

const DEFAULT_BET_AMOUNT = "1000";
const DEFAULT_INITIAL_BALANCE = "1000";

describe("ChessFactory", function () {
  async function deployFactoryFixture() {
    const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
    const chessTemplate = await hre.ethers.deployContract("ChessTemplate");
    const chessToken = await hre.ethers.deployContract("ChessToken", [
      hre.ethers.parseUnits("1000000", 18),
    ]);
    const chessFactory = await hre.ethers.deployContract("ChessFactory", [
      chessTemplate.target,
    ]);
    await chessFactory.setChessToken(chessToken.target);
    const depositAmount = hre.ethers.parseUnits("100000", 18);
    await chessToken.approve(chessFactory.target, depositAmount);
    await chessFactory.depositTokens(depositAmount);

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

  // Helper function to register a user
  async function registerUser(chessFactory: any, user: any, pseudo = "Player") {
    await chessFactory.connect(user).registerUser(pseudo);
  }

  // Helper function to create a game
  async function createGame(
    chessFactory,
    owner,
    betAmount = DEFAULT_BET_AMOUNT,
    startOffset = 3600
  ) {
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const startTime = currentBlock.timestamp + startOffset;
    const betAmountUnits = hre.ethers.parseUnits(betAmount, 18);

    await chessFactory.connect(owner).createGame(betAmountUnits, startTime);

    const games = await chessFactory.getGames(0, 1);
    return games[0].gameAddress;
  }

  // Helper function to get game details
  async function getGameDetails(chessFactory: any, gameAddress: string) {
    return await chessFactory.getGameDetails(gameAddress);
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
      ).to.be.revertedWithCustomError(chessFactory, "InvalidChessTokenAddress");
    });
  });

  describe("Token Management", function () {
    it("Should allow the owner to deposit ChessTokens", async function () {
      const { chessFactory, chessToken } = await loadFixture(
        deployFactoryFixture
      );

      // Deposit additional tokens
      const depositAmount = hre.ethers.parseUnits("50000", 18);
      await chessToken.approve(chessFactory.target, depositAmount);
      await chessFactory.depositTokens(depositAmount);

      // New platform balance
      const newBalance = await chessFactory.platformBalance();
      const expectedNewBalance = hre.ethers.parseUnits("150000", 18);

      // Verify the platform balance increased correctly
      expect(newBalance).to.equal(expectedNewBalance);
    });

    it("Should revert if non-owner tries to deposit ChessTokens", async function () {
      const { chessFactory, chessToken, addr1 } = await loadFixture(
        deployFactoryFixture
      );

      // Approve ChessFactory to spend tokens from addr1
      const depositAmount = hre.ethers.parseUnits("50000", 18);
      await chessToken
        .connect(addr1)
        .approve(chessFactory.target, depositAmount);

      // Attempt to deposit tokens as a non-owner
      await expect(
        chessFactory.connect(addr1).depositTokens(depositAmount)
      ).to.be.revertedWithCustomError(
        chessFactory,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Game Creation", function () {
    it("Should create a new game and register player", async function () {
      const { chessFactory, owner, addr1 } = await loadFixture(
        deployFactoryFixture
      );

      // Register user
      await registerUser(chessFactory, addr1, "Player1");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Verify game creation
      const gameDetails = await getGameDetails(chessFactory, gameAddress);
      expect(gameDetails.gameAddress).to.not.equal(hre.ethers.ZeroAddress);
      expect(gameDetails.betAmount).to.equal(
        hre.ethers.parseUnits(DEFAULT_BET_AMOUNT, 18)
      );

      // Register to the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);

      // Verify player registration
      const updatedGameDetails = await getGameDetails(
        chessFactory,
        gameAddress
      );
      expect(updatedGameDetails.player1.userAddress).to.equal(addr1.address);
    });

    it("Should revert if betAmount is zero", async function () {
      const { chessFactory, owner } = await loadFixture(deployFactoryFixture);

      const currentBlock = await hre.ethers.provider.getBlock("latest");
      const startTime = currentBlock.timestamp + 3600;
      const betAmount = hre.ethers.parseUnits("0", 18); // Zero bet amount

      await expect(
        chessFactory.connect(owner).createGame(betAmount, startTime)
      ).to.be.revertedWithCustomError(chessFactory, "InvalidBetAmount");
    });

    it("Should revert if start time is in the past", async function () {
      const { chessFactory, owner } = await loadFixture(deployFactoryFixture);

      const currentBlock = await hre.ethers.provider.getBlock("latest");
      const startTime = currentBlock.timestamp - 3600; // Past start time
      const betAmount = hre.ethers.parseUnits(DEFAULT_BET_AMOUNT, 18);

      await expect(
        chessFactory.connect(owner).createGame(betAmount, startTime)
      ).to.be.revertedWithCustomError(chessFactory, "StartTimeInPast");
    });
  });

  describe("User Registration", function () {
    it("Should register a new user", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      // Register user
      await registerUser(chessFactory, addr1, "Player1");

      // Retrieve user details
      const user = await chessFactory.connect(addr1).getUser();

      // Verify user details
      expect(user.userAddress).to.equal(addr1.address);
      expect(user.pseudo).to.equal("Player1");
      expect(user.balance).to.equal(
        hre.ethers.parseUnits(DEFAULT_INITIAL_BALANCE, 18)
      );
    });

    it("Should revert if user tries to register twice", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      // Register user once
      await registerUser(chessFactory, addr1, "Player1");

      // Attempt to register again
      await expect(
        chessFactory.connect(addr1).registerUser("Player1")
      ).to.be.revertedWithCustomError(chessFactory, "UserAlreadyRegistered");
    });

    it("Should revert if pseudo is empty", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      // Attempt to register with empty pseudo
      await expect(
        chessFactory.connect(addr1).registerUser("")
      ).to.be.revertedWithCustomError(chessFactory, "EmptyPseudo");
    });
  });

  describe("Game Participation", function () {
    it("Should allow users to join a game", async function () {
      const { chessFactory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      );

      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Retrieve updated game details
      const gameDetails = await getGameDetails(chessFactory, gameAddress);

      // Verify both players are registered
      expect(gameDetails.player1.userAddress).to.equal(addr1.address);
      expect(gameDetails.player2.userAddress).to.equal(addr2.address);
    });

    it("Should revert if non-registered user tries to join a game", async function () {
      const { chessFactory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      );

      // Register only addr1
      await registerUser(chessFactory, addr1, "Player1");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Attempt to register addr2 without registering
      await expect(
        chessFactory.connect(addr2).registerToGame(gameAddress)
      ).to.be.revertedWithCustomError(chessFactory, "UserNotRegistered");
    });

    // Additional tests can be added here following the same pattern
  });

  describe("Rewards Distribution", function () {
    it("Should distribute rewards to the winner", async function () {
      const { chessFactory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      );
      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Simulate game end with addr1 as winner
      const platformFee = hre.ethers.parseUnits("500", 18);
      const reward = hre.ethers.parseUnits("1500", 18);

      await chessFactory.distributeRewards(
        addr1.address,
        addr2.address,
        addr1.address, // Winner is addr1
        platformFee,
        reward
      );

      // Check balances
      const user1 = await chessFactory.connect(addr1).getUser();
      const user2 = await chessFactory.connect(addr2).getUser();
      const platformBalance = await chessFactory.platformBalance();

      expect(user1.balance).to.equal(hre.ethers.parseUnits("1500", 18)); // 1000 initial - betAmount 1000 + 1500 reward
      expect(user2.balance).to.equal(0); // 1000 initial - betAmount 1000
      expect(platformBalance).to.equal(hre.ethers.parseUnits("100500", 18)); // 100000 initial + 500 fee
    });

    it("Should distribute rewards to both players in case of a draw", async function () {
      const { chessFactory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      );

      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Simulate game end with a draw
      const platformFee = hre.ethers.parseUnits("500", 18);
      const reward = hre.ethers.parseUnits("750", 18); // Each player gets 750
      await chessFactory.distributeRewards(
        addr1.address,
        addr2.address,
        hre.ethers.ZeroAddress, // Draw
        platformFee,
        reward
      );

      // Check balances
      const user1 = await chessFactory.connect(addr1).getUser();
      const user2 = await chessFactory.connect(addr2).getUser();
      const platformBalance = await chessFactory.platformBalance();

      expect(user1.balance).to.equal(hre.ethers.parseUnits("750", 18)); // 1000 initial - 1000 betAmount + 750 reward
      expect(user2.balance).to.equal(hre.ethers.parseUnits("750", 18)); // 1000 initial - 1000 betAmount + 750 reward
      expect(platformBalance).to.equal(hre.ethers.parseUnits("100500", 18)); // 10000 initial + 500 fee
    });

    it("Should revert if platform balance is insufficient for rewards", async function () {
      const { chessFactory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      );

      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Simulate game end with addr1 as winner but insufficient platform balance
      const platformFee = hre.ethers.parseUnits("500000", 18); // Exceeds current platform balance
      const reward = hre.ethers.parseUnits("1000", 18);

      await expect(
        chessFactory.distributeRewards(
          addr1.address,
          addr2.address,
          addr1.address,
          platformFee,
          reward
        )
      ).to.be.revertedWithCustomError(
        chessFactory,
        "InsufficientPlatformBalance"
      );
    });
  });

  describe("Withdrawals", function () {
    describe("Withdraw ChessTokens", function () {
      it("Should allow the owner to withdraw ChessTokens", async function () {
        const { chessFactory, chessToken, owner } = await loadFixture(
          deployFactoryFixture
        );

        // Owner withdraws 5000 ChessTokens
        const withdrawAmount = hre.ethers.parseUnits("50000", 18);
        await chessFactory.withdrawTokens(withdrawAmount);

        // Check owner's ChessToken balance
        const ownerBalance = await chessToken.balanceOf(owner.address);
        expect(ownerBalance).to.equal(hre.ethers.parseUnits("950000", 18)); // Initial 10000000 - 100000 deposited + 50000 withdrawn

        // Check platform balance
        const platformBalance = await chessFactory.platformBalance();
        expect(platformBalance).to.equal(hre.ethers.parseUnits("50000", 18)); // 100000 initial - 50000 withdrawn
      });

      it("Should revert if non-owner tries to withdraw ChessTokens", async function () {
        const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

        // Attempt to withdraw tokens as a non-owner
        const withdrawAmount = hre.ethers.parseUnits("1000", 18);
        await expect(
          chessFactory.connect(addr1).withdrawTokens(withdrawAmount)
        ).to.be.revertedWithCustomError(
          chessFactory,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert if withdrawing more ChessTokens than the platform balance", async function () {
        const { chessFactory } = await loadFixture(deployFactoryFixture);

        // Attempt to withdraw more tokens than available
        const withdrawAmount = hre.ethers.parseUnits("200000", 18); // Platform balance is 10000
        await expect(
          chessFactory.withdrawTokens(withdrawAmount)
        ).to.be.revertedWithCustomError(
          chessFactory,
          "InsufficientContractBalance"
        );
      });
    });

    describe("Withdraw Ether", function () {
      it("Should allow the owner to withdraw Ether", async function () {
        const { chessFactory, owner } = await loadFixture(deployFactoryFixture);

        // Send some Ether to the contract for withdrawal
        const sendAmount = hre.ethers.parseEther("10");
        await owner.sendTransaction({
          to: chessFactory.target,
          value: sendAmount,
        });

        // Owner withdraws 5 Ether
        const withdrawAmount = hre.ethers.parseEther("5");
        await chessFactory.withdrawEther(withdrawAmount);

        // Check the contract's Ether balance
        const contractBalance = await hre.ethers.provider.getBalance(
          chessFactory.target
        );
        expect(contractBalance).to.equal(hre.ethers.parseEther("5"));
      });

      it("Should revert if non-owner tries to withdraw Ether", async function () {
        const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

        // Attempt to withdraw Ether as a non-owner
        const withdrawAmount = hre.ethers.parseEther("1");
        await expect(
          chessFactory.connect(addr1).withdrawEther(withdrawAmount)
        ).to.be.revertedWithCustomError(
          chessFactory,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert if withdrawing more Ether than the contract balance", async function () {
        const { chessFactory } = await loadFixture(deployFactoryFixture);

        // Contract Ether balance is 0
        const withdrawAmount = hre.ethers.parseEther("1");
        await expect(
          chessFactory.withdrawEther(withdrawAmount)
        ).to.be.revertedWithCustomError(
          chessFactory,
          "InsufficientContractBalance"
        );
      });
    });
  });
});
