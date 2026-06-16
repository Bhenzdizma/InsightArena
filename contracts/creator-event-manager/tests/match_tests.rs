/// Tests for event match counting.
use creator_event_manager::storage;
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String};

const FEE: i128 = 1_000_000;

fn setup() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id =
        env.register_contract(None, creator_event_manager::CreatorEventManagerContract);
    let client = CreatorEventManagerContractClient::new(&env, &contract_id);
    let client: CreatorEventManagerContractClient<'static> = unsafe { core::mem::transmute(client) };

    let admin = Address::generate(&env);
    let ai_agent = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let xlm_token = env.register_stellar_asset_contract_v2(token_admin).address();

    client.initialize(&admin, &ai_agent, &treasury, &xlm_token, &FEE);
    (env, client, contract_id, admin, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

fn title(env: &Env) -> String {
    String::from_str(env, "World Cup 2026 Predictions")
}

fn desc(env: &Env) -> String {
    String::from_str(env, "Predict the matches of the 2026 World Cup.")
}

#[test]
fn test_get_match_count_returns_zero_for_new_event() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    assert_eq!(client.get_match_count(&event_id), 0);
}

#[test]
fn test_get_match_count_returns_correct_count() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let _match_id = env.as_contract(&contract_id, || {
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(&env, event_id, &event);

        let match_id = storage::next_match_id(&env);
        let match_record = creator_event_manager::storage_types::Match::new(
            match_id,
            event_id,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            env.ledger().timestamp() + 10_000,
        );
        storage::set_match(&env, match_id, &match_record);
        storage::add_event_match(&env, event_id, match_id);
        match_id
    });

    assert_eq!(client.get_match_count(&event_id), 1);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_match_count_missing_event_panics() {
    let (_env, client, _contract_id, _admin, _xlm_token) = setup();
    client.get_match_count(&999u64);
}

// ============================================================================
// Tests for create_match entrypoint
// ============================================================================

#[test]
fn test_create_match_success() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let now = env.ledger().timestamp();
    let match_time = now + 86400; // Tomorrow
    let team_a = String::from_str(&env, "Brazil");
    let team_b = String::from_str(&env, "Argentina");

    let match_id = client.create_match(&creator, &event_id, &team_a, &team_b, &match_time);

    // Verify match_id is returned
    assert!(match_id > 0);

    // Verify match_count incremented
    assert_eq!(client.get_match_count(&event_id), 1);

    // Verify match appears in list
    let matches = client.list_event_matches(&event_id);
    assert_eq!(matches.len(), 1);
    let m = matches.get_unchecked(0);
    assert_eq!(m.match_id, match_id);
    assert_eq!(m.team_a, team_a);
    assert_eq!(m.team_b, team_b);
    assert_eq!(m.match_time, match_time);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_create_match_unauthorized() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let other_user = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let now = env.ledger().timestamp();
    let match_time = now + 86400;
    let team_a = String::from_str(&env, "Team A");
    let team_b = String::from_str(&env, "Team B");

    // Try to create match as non-creator
    client.create_match(&other_user, &event_id, &team_a, &team_b, &match_time);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_create_match_event_not_found() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let now = env.ledger().timestamp();
    let match_time = now + 86400;
    let team_a = String::from_str(&env, "Team A");
    let team_b = String::from_str(&env, "Team B");

    // Try to create match for non-existent event
    client.create_match(&creator, &999u64, &team_a, &team_b, &match_time);
}

#[test]
#[should_panic(expected = "event_cancelled")]
fn test_create_match_event_cancelled() {
    let (env, client, contract_id, admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    // Cancel the event (admin only operation - simulated by direct storage manipulation)
    env.as_contract(&contract_id, || {
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.cancel();
        storage::set_event(&env, event_id, &event);
    });

    let now = env.ledger().timestamp();
    let match_time = now + 86400;
    let team_a = String::from_str(&env, "Team A");
    let team_b = String::from_str(&env, "Team B");

    // Try to create match for cancelled event
    client.create_match(&creator, &event_id, &team_a, &team_b, &match_time);
}

#[test]
#[should_panic(expected = "invalid_team_names")]
fn test_create_match_invalid_team_names_empty() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let now = env.ledger().timestamp();
    let match_time = now + 86400;
    let team_a = String::from_str(&env, "");
    let team_b = String::from_str(&env, "Team B");

    client.create_match(&creator, &event_id, &team_a, &team_b, &match_time);
}

#[test]
#[should_panic(expected = "invalid_team_names")]
fn test_create_match_invalid_team_names_too_long() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let now = env.ledger().timestamp();
    let match_time = now + 86400;
    // Create a string longer than MAX_TEAM_NAME_LEN (100)
    let long_name = String::from_str(
        &env,
        "VeryLongTeamNameThatExceedsMaximumAllowedLengthOfOneHundredCharactersVeryLongTeamNameThatExceedingMaxAllowed",
    );
    let team_b = String::from_str(&env, "Team B");

    client.create_match(&creator, &event_id, &long_name, &team_b, &match_time);
}

#[test]
#[should_panic(expected = "invalid_team_names")]
fn test_create_match_invalid_team_names_identical() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let now = env.ledger().timestamp();
    let match_time = now + 86400;
    let team_name = String::from_str(&env, "Team A");

    // Try to create match with identical team names
    client.create_match(&creator, &event_id, &team_name, &team_name, &match_time);
}

#[test]
#[should_panic(expected = "invalid_match_time")]
fn test_create_match_past_time_rejected() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let now = env.ledger().timestamp();
    // Set match time to now (which should be rejected as it's not in the future, <= current time)
    let match_time = now;
    let team_a = String::from_str(&env, "Team A");
    let team_b = String::from_str(&env, "Team B");

    client.create_match(&creator, &event_id, &team_a, &team_b, &match_time);
}

#[test]
fn test_create_multiple_matches_sorted_by_time() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let now = env.ledger().timestamp();

    // Create 3 matches with different times, out of chronological order
    let match_time_1 = now + 86400 * 3; // 3 days from now
    let match_time_2 = now + 86400; // 1 day from now
    let match_time_3 = now + 86400 * 2; // 2 days from now

    let team_a1 = String::from_str(&env, "Brazil");
    let team_b1 = String::from_str(&env, "Argentina");
    let _match_id_1 = client.create_match(&creator, &event_id, &team_a1, &team_b1, &match_time_1);

    let team_a2 = String::from_str(&env, "Germany");
    let team_b2 = String::from_str(&env, "France");
    let _match_id_2 = client.create_match(&creator, &event_id, &team_a2, &team_b2, &match_time_2);

    let team_a3 = String::from_str(&env, "Spain");
    let team_b3 = String::from_str(&env, "Italy");
    let _match_id_3 = client.create_match(&creator, &event_id, &team_a3, &team_b3, &match_time_3);

    // Verify all 3 matches are in the list
    assert_eq!(client.get_match_count(&event_id), 3);

    // Verify they are sorted by match_time
    let matches = client.list_event_matches(&event_id);
    assert_eq!(matches.len(), 3);

    assert_eq!(matches.get_unchecked(0).match_time, match_time_2); // 1 day (earliest)
    assert_eq!(matches.get_unchecked(1).match_time, match_time_3); // 2 days
    assert_eq!(matches.get_unchecked(2).match_time, match_time_1); // 3 days (latest)

    // Verify team names are preserved
    assert_eq!(matches.get_unchecked(0).team_a, team_a2);
    assert_eq!(matches.get_unchecked(1).team_a, team_a3);
    assert_eq!(matches.get_unchecked(2).team_a, team_a1);
}
