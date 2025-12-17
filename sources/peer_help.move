#[allow(unused_const)]
module suilotion::peer_help {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    const EAlreadyVoted: u64 = 1;
    const EProfileAlreadyExists: u64 = 9;
    const EInvalidDifficultyScore: u64 = 10;
    const ERequestClosed: u64 = 11;
    const ESelfHelp: u64 = 12;
    const EAlreadyOffered: u64 = 13;
    const XP_BASE: u64 = 10;
    const MIN_VOTES_REQUIRED: u64 = 2;
    const REWARD_MULTIPLIER: u64 = 100;
    public struct PeerHelpRegistry has key {
        id: UID,
        profiles: Table<address, ID>,
        total_requests: u64,
        total_matches: u64,
        total_completions: u64,
    }
    public struct StudentProfile has key {
        id: UID,
        owner: address,
        display_name: String,
        intra_login: String,
        competencies: VecMap<u8, u8>,
        helps_given: u64,
        helps_received: u64,
        total_xp: u64,
        total_offers_made: u64,
        success_ratio: u64,
        avg_feedback_score: u64,
        feedback_count: u64,
        tier: u8,
        created_at: u64,
        total_rewards_earned: u64,
    }
    public struct HelpRequest has key, store {
        id: UID,
        requester: address,
        topic: u8,
        title: String,
        description: String,
        initial_difficulty: u8,
        community_difficulty: u8,
        difficulty_vote_count: u64,
        difficulty_vote_sum: u64,
        voters: vector<address>,
        status: u8,
        created_at: u64,
        offers: vector<ID>,
        mentor_addresses: vector<address>,
        match_id: Option<ID>,
        reward_claimed: bool,
    }
    public struct HelpOffer has key, store {
        id: UID,
        mentor: address,
        request_id: ID,
        message: String,
        competency_level: u8,
        past_helps_on_topic: u64,
        status: u8,
        created_at: u64,
    }
    public struct MatchRecord has key, store {
        id: UID,
        mentor: address,
        mentee: address,
        request_id: ID,
        offer_id: ID,
        topic: u8,
        matched_at: u64,
        status: u8,
        mentor_confirmed: bool,
        mentee_confirmed: bool,
        feedback_score: u8,
        completed_at: Option<u64>,
    }
    public struct HelpRequestCreated has copy, drop {
        request_id: ID,
        requester: address,
        topic: u8,
        title: String,
        initial_difficulty: u8,
        timestamp: u64,
    }
    public struct HelpOfferCreated has copy, drop {
        offer_id: ID,
        request_id: ID,
        mentor: address,
        competency_level: u8,
        timestamp: u64,
    }
    public struct MatchCreated has copy, drop {
        match_id: ID,
        request_id: ID,
        mentor: address,
        mentee: address,
        topic: u8,
        timestamp: u64,
    }
    public struct HelpCompleted has copy, drop {
        match_id: ID,
        mentor: address,
        mentee: address,
        topic: u8,
        feedback_score: u8,
        timestamp: u64,
    }
    public struct DifficultyVoteEvent has copy, drop {
        request_id: ID,
        voter: address,
        vote: u8,
        new_community_difficulty: u8,
        vote_count: u64,
        timestamp: u64,
    }
    public struct RewardClaimedEvent has copy, drop {
        request_id: ID,
        mentor: address,
        reward_amount: u64,
        final_difficulty: u8,
        timestamp: u64,
    }
    public struct MentorRewardPending has copy, drop {
        match_id: ID,
        mentor: address,
        request_id: ID,
        xp_amount: u64,
        reward_amount: u64,
        topic: u8,
        feedback_score: u8,
        timestamp: u64,
    }
    public struct ProfileCreated has copy, drop {
        profile_id: ID,
        owner: address,
        display_name: String,
        timestamp: u64,
    }
    public struct TierNFT has key, store {
        id: UID,
        owner: address,
        tier: u8,
        tier_name: String,
        minted_at: u64,
        helps_given: u64,
    }
    public struct TierUpgradeEvent has copy, drop {
        profile_id: ID,
        owner: address,
        old_tier: u8,
        new_tier: u8,
        helps_given: u64,
        nft_id: ID,
        timestamp: u64,
    }
    const TIER_BRONZE: u64 = 5;
    const TIER_SILVER: u64 = 15;
    const TIER_GOLD: u64 = 40;
    const TIER_DIAMOND: u64 = 100;
    fun calculate_tier(helps_given: u64): u8 {
        if (helps_given >= TIER_DIAMOND) {
            4
        } else if (helps_given >= TIER_GOLD) {
            3
        } else if (helps_given >= TIER_SILVER) {
            2
        } else if (helps_given >= TIER_BRONZE) {
            1
        } else {
            0
        }
    }
    fun get_tier_name(tier: u8): String {
        if (tier == 4) {
            string::utf8(b"Diamond")
        } else if (tier == 3) {
            string::utf8(b"Gold")
        } else if (tier == 2) {
            string::utf8(b"Silver")
        } else if (tier == 1) {
            string::utf8(b"Bronze")
        } else {
            string::utf8(b"Newcomer")
        }
    }
    fun init(ctx: &mut TxContext) {
        let registry = PeerHelpRegistry {
            id: object::new(ctx),
            profiles: table::new(ctx),
            total_requests: 0,
            total_matches: 0,
            total_completions: 0,
        };
        transfer::share_object(registry);
    }
    public entry fun create_profile(
        registry: &mut PeerHelpRegistry,
        display_name: vector<u8>,
        intra_login: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(!table::contains(&registry.profiles, sender), EProfileAlreadyExists);
        let profile = StudentProfile {
            id: object::new(ctx),
            owner: sender,
            display_name: string::utf8(display_name),
            intra_login: string::utf8(intra_login),
            competencies: vec_map::empty(),
            helps_given: 0,
            helps_received: 0,
            total_xp: 0,
            total_offers_made: 0,
            success_ratio: 0,
            avg_feedback_score: 0,
            feedback_count: 0,
            tier: 0,
            created_at: clock::timestamp_ms(clock),
            total_rewards_earned: 0,
        };
        let profile_id = object::id(&profile);
        table::add(&mut registry.profiles, sender, profile_id);
        event::emit(ProfileCreated {
            profile_id,
            owner: sender,
            display_name: string::utf8(display_name),
            timestamp: clock::timestamp_ms(clock),
        });
        transfer::transfer(profile, sender);
    }
    public entry fun create_help_request(
        registry: &mut PeerHelpRegistry,
        topic: u8,
        title: vector<u8>,
        description: vector<u8>,
        initial_difficulty: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(initial_difficulty >= 1 && initial_difficulty <= 5, EInvalidDifficultyScore);
        let sender = ctx.sender();
        let timestamp = clock::timestamp_ms(clock);
        let request = HelpRequest {
            id: object::new(ctx),
            requester: sender,
            topic,
            title: string::utf8(title),
            description: string::utf8(description),
            initial_difficulty,
            community_difficulty: initial_difficulty,
            difficulty_vote_count: 0,
            difficulty_vote_sum: 0,
            voters: vector::empty(),
            status: 0,
            created_at: timestamp,
            offers: vector::empty(),
            mentor_addresses: vector::empty(),
            match_id: std::option::none(),
            reward_claimed: false,
        };
        let request_id = object::id(&request);
        registry.total_requests = registry.total_requests + 1;
        event::emit(HelpRequestCreated {
            request_id,
            requester: sender,
            topic,
            title: string::utf8(title),
            initial_difficulty,
            timestamp,
        });
        transfer::share_object(request);
    }
    public entry fun create_help_offer(
        request: &mut HelpRequest,
        profile: &mut StudentProfile,
        message: vector<u8>,
        competency_level: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(sender != request.requester, ESelfHelp);
        assert!(request.status == 0, ERequestClosed);
        assert!(competency_level >= 1 && competency_level <= 5, EInvalidDifficultyScore);
        let mut already_offered = false;
        let mut i = 0;
        let len = vector::length(&request.mentor_addresses);
        while (i < len) {
            if (*vector::borrow(&request.mentor_addresses, i) == sender) {
                already_offered = true;
                break
            };
            i = i + 1;
        };
        assert!(!already_offered, EAlreadyOffered);
        let past_helps = if (vec_map::contains(&profile.competencies, &request.topic)) {
            (*vec_map::get(&profile.competencies, &request.topic) as u64)
        } else {
            0
        };
        profile.total_offers_made = profile.total_offers_made + 1;
        if (profile.total_offers_made > 0) {
            profile.success_ratio = (profile.helps_given * 100) / profile.total_offers_made;
        };
        let timestamp = clock::timestamp_ms(clock);
        let offer = HelpOffer {
            id: object::new(ctx),
            mentor: sender,
            request_id: object::id(request),
            message: string::utf8(message),
            competency_level,
            past_helps_on_topic: past_helps,
            status: 0,
            created_at: timestamp,
        };
        let offer_id = object::id(&offer);
        vector::push_back(&mut request.offers, offer_id);
        vector::push_back(&mut request.mentor_addresses, sender);
        event::emit(HelpOfferCreated {
            offer_id,
            request_id: object::id(request),
            mentor: sender,
            competency_level,
            timestamp,
        });
        transfer::share_object(offer);
    }
    public entry fun accept_offer(
        registry: &mut PeerHelpRegistry,
        request: &mut HelpRequest,
        offer: &mut HelpOffer,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(sender == request.requester, 2);
        assert!(request.status == 0, ERequestClosed);
        assert!(offer.status == 0, 5);
        assert!(offer.request_id == object::id(request), 4);
        let timestamp = clock::timestamp_ms(clock);
        let match_record = MatchRecord {
            id: object::new(ctx),
            mentor: offer.mentor,
            mentee: sender,
            request_id: object::id(request),
            offer_id: object::id(offer),
            topic: request.topic,
            matched_at: timestamp,
            status: 0,
            mentor_confirmed: false,
            mentee_confirmed: false,
            feedback_score: 0,
            completed_at: std::option::none(),
        };
        let match_id = object::id(&match_record);
        request.status = 1;
        request.match_id = std::option::some(match_id);
        offer.status = 1;
        registry.total_matches = registry.total_matches + 1;
        event::emit(MatchCreated {
            match_id,
            request_id: object::id(request),
            mentor: offer.mentor,
            mentee: sender,
            topic: request.topic,
            timestamp,
        });
        transfer::share_object(match_record);
    }
    public entry fun reject_offer(
        offer: &mut HelpOffer
    ) {
        assert!(offer.status == 0, 5);
        offer.status = 2;
    }
    public entry fun vote_difficulty(
        request: &mut HelpRequest,
        vote: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(request.status == 0 || request.status == 1, ERequestClosed);
        assert!(vote >= 1 && vote <= 5, EInvalidDifficultyScore);
        assert!(sender != request.requester, ESelfHelp);
        assert!(!vector::contains(&request.voters, &sender), 1);
        vector::push_back(&mut request.voters, sender);
        request.difficulty_vote_count = request.difficulty_vote_count + 1;
        request.difficulty_vote_sum = request.difficulty_vote_sum + (vote as u64);
        let average = request.difficulty_vote_sum / request.difficulty_vote_count;
        let remainder = request.difficulty_vote_sum % request.difficulty_vote_count;
        let new_difficulty = if (remainder * 2 >= request.difficulty_vote_count) {
            average + 1
        } else {
            average
        };
        let final_difficulty = if (new_difficulty > 5) {
            5
        } else if (new_difficulty < 1) {
            1
        } else {
            new_difficulty
        };
        let final_difficulty_u8 = (final_difficulty as u8);
        request.community_difficulty = final_difficulty_u8;
        event::emit(DifficultyVoteEvent {
            request_id: object::id(request),
            voter: sender,
            vote,
            new_community_difficulty: final_difficulty_u8,
            vote_count: request.difficulty_vote_count,
            timestamp: clock::timestamp_ms(clock),
        });
    }
    public entry fun mentor_confirm_completion(
        match_record: &mut MatchRecord,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(sender == match_record.mentor, 6);
        assert!(match_record.status == 0, 7);
        assert!(!match_record.mentor_confirmed, 7);
        match_record.mentor_confirmed = true;
    }
    public entry fun mentee_confirm_completion(
        registry: &mut PeerHelpRegistry,
        match_record: &mut MatchRecord,
        request: &mut HelpRequest,
        mentee_profile: &mut StudentProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(sender == match_record.mentee, 6);
        assert!(match_record.status == 0, 7);
        assert!(!match_record.mentee_confirmed, 7);
        if (!match_record.mentor_confirmed) {
            match_record.mentor_confirmed = true;
        };
        let timestamp = clock::timestamp_ms(clock);
        match_record.mentee_confirmed = true;
        match_record.status = 1;
        let feedback_score = 80;
        match_record.feedback_score = feedback_score;
        match_record.completed_at = std::option::some(timestamp);
        request.status = 2;
        let difficulty_xp = (request.community_difficulty as u64) * XP_BASE;
        let reward_amount = if (request.difficulty_vote_count >= MIN_VOTES_REQUIRED) {
            let average_difficulty = request.community_difficulty as u64;
            (average_difficulty * REWARD_MULTIPLIER) / 5
        } else {
            0
        };
        if (reward_amount > 0) {
            event::emit(RewardClaimedEvent {
                request_id: object::id(request),
                mentor: match_record.mentor,
                reward_amount,
                final_difficulty: request.community_difficulty,
                timestamp,
            });
        };
        mentee_profile.helps_received = mentee_profile.helps_received + 1;
        registry.total_completions = registry.total_completions + 1;
        let topic = match_record.topic;
        event::emit(HelpCompleted {
            match_id: object::id(match_record),
            mentor: match_record.mentor,
            mentee: match_record.mentee,
            topic,
            feedback_score,
            timestamp,
        });
        event::emit(MentorRewardPending {
            match_id: object::id(match_record),
            mentor: match_record.mentor,
            request_id: object::id(request),
            xp_amount: difficulty_xp,
            reward_amount,
            topic,
            feedback_score,
            timestamp,
        });
    }
    public entry fun mentor_claim_reward(
        _registry: &mut PeerHelpRegistry,
        match_record: &mut MatchRecord,
        request: &mut HelpRequest,
        mentor_profile: &mut StudentProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(sender == match_record.mentor, 6);
        assert!(match_record.status == 1, 7);
        assert!(match_record.mentee_confirmed, 7);
        assert!(!request.reward_claimed, 8);
        request.reward_claimed = true;
        mentor_profile.helps_given = mentor_profile.helps_given + 1;
        let difficulty_xp = (request.community_difficulty as u64) * XP_BASE;
        mentor_profile.total_xp = mentor_profile.total_xp + difficulty_xp;
        if (request.difficulty_vote_count >= MIN_VOTES_REQUIRED) {
            let average_difficulty = request.community_difficulty as u64;
            let reward_amount = (average_difficulty * REWARD_MULTIPLIER) / 5;
            mentor_profile.total_rewards_earned = mentor_profile.total_rewards_earned + reward_amount;
        };
        if (mentor_profile.total_offers_made > 0) {
            mentor_profile.success_ratio = (mentor_profile.helps_given * 100) / mentor_profile.total_offers_made;
        };
        let feedback_score = match_record.feedback_score;
        let new_feedback_total = (mentor_profile.avg_feedback_score * mentor_profile.feedback_count) + (feedback_score as u64);
        mentor_profile.feedback_count = mentor_profile.feedback_count + 1;
        mentor_profile.avg_feedback_score = new_feedback_total / mentor_profile.feedback_count;
        let topic = match_record.topic;
        if (vec_map::contains(&mentor_profile.competencies, &topic)) {
            let current = *vec_map::get(&mentor_profile.competencies, &topic);
            if (current < 5) {
                vec_map::remove(&mut mentor_profile.competencies, &topic);
                vec_map::insert(&mut mentor_profile.competencies, topic, current + 1);
            };
        } else {
            vec_map::insert(&mut mentor_profile.competencies, topic, 1);
        };
        let old_tier = mentor_profile.tier;
        let new_tier = calculate_tier(mentor_profile.helps_given);
        mentor_profile.tier = new_tier;
        if (new_tier > old_tier && new_tier > 0) {
            let tier_name = get_tier_name(new_tier);
            let nft = TierNFT {
                id: object::new(ctx),
                owner: sender,
                tier: new_tier,
                tier_name,
                minted_at: clock::timestamp_ms(clock),
                helps_given: mentor_profile.helps_given,
            };
            let nft_id = object::id(&nft);
            event::emit(TierUpgradeEvent {
                profile_id: object::id(mentor_profile),
                owner: sender,
                old_tier,
                new_tier,
                helps_given: mentor_profile.helps_given,
                nft_id,
                timestamp: clock::timestamp_ms(clock),
            });
            transfer::transfer(nft, sender);
        };
    }
    public entry fun mentee_reject_completion(
        _registry: &mut PeerHelpRegistry,
        match_record: &mut MatchRecord,
        request: &mut HelpRequest,
        mentee_profile: &mut StudentProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        assert!(sender == match_record.mentee, 6);
        assert!(match_record.status == 0, 7);
        assert!(!match_record.mentee_confirmed, 7);
        let timestamp = clock::timestamp_ms(clock);
        match_record.mentee_confirmed = true;
        match_record.status = 2;
        match_record.feedback_score = 0;
        match_record.completed_at = std::option::some(timestamp);
        request.status = 3;
        mentee_profile.helps_received = mentee_profile.helps_received + 1;
        event::emit(HelpCompleted {
            match_id: object::id(match_record),
            mentor: match_record.mentor,
            mentee: match_record.mentee,
            topic: match_record.topic,
            feedback_score: 0,
            timestamp,
        });
    }
}
