"""Basic tests for factoids models."""

from apps.factoids import models


def test_factoid_string_representation():
    factoid = models.Factoid(text="Example factoid", subject="Science", emoji="🧠")
    assert "Example" in str(factoid)


def test_vote_aggregate_unique_constraint(db):
    factoid = models.Factoid.objects.create(text="Example")
    models.VoteAggregate.objects.create(
        factoid=factoid,
        client_hash="hash",
        vote_type=models.VoteType.UP,
    )

    assert models.VoteAggregate.objects.filter(factoid=factoid).count() == 1


def test_generation_request_defaults():
    request = models.GenerationRequest(client_hash="hash", model_key="model")
    assert request.status == models.RequestStatus.PENDING
